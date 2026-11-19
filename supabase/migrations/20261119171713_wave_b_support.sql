-- =============================================================================
-- Wave B, support desk (module 12): the data model.
--
-- One conversation per mail thread in a shared mailbox. Messages are the mail
-- in and out plus staff notes. The server (service role) writes mail rows
-- while it syncs the mailbox and after it sends; people only add notes and
-- change who has a conversation, its status and its category.
--
-- Conversations hold parents' names, addresses and what they wrote, so every
-- table here is staff only (owner, admin, office, support). Crew and league
-- coordinators see nothing.
-- =============================================================================

create type public.support_status as enum ('new', 'open', 'waiting_customer', 'waiting_lab', 'closed');

create table public.support_conversations (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  mailbox             text not null,
  gmail_thread_id     text,
  subject             text not null default '(no subject)',
  customer_email      text,
  customer_name       text,
  status              public.support_status not null default 'new',
  category            text,
  assignee_id         uuid references public.profiles(id) on delete set null,
  organization_id     uuid references public.organizations(id) on delete set null,
  job_id              uuid references public.jobs(id) on delete set null,
  first_message_at    timestamptz,
  last_message_at     timestamptz,
  last_inbound_at     timestamptz,
  first_response_at   timestamptz,
  closed_at           timestamptz,
  closed_by           uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (company_id, mailbox, gmail_thread_id)
);
create index support_conversations_queue_idx on public.support_conversations (company_id, status, last_message_at desc);
create index support_conversations_assignee_idx on public.support_conversations (assignee_id) where status <> 'closed';
create index support_conversations_customer_idx on public.support_conversations (company_id, lower(customer_email));
create index support_conversations_org_idx on public.support_conversations (organization_id);
create index support_conversations_job_idx on public.support_conversations (job_id);
create index support_conversations_closed_by_idx on public.support_conversations (closed_by);

create table public.support_messages (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  conversation_id   uuid not null references public.support_conversations(id) on delete cascade,
  direction         text not null check (direction in ('in', 'out', 'note')),
  gmail_message_id  text,
  from_address      text,
  from_name         text,
  to_addresses      text[] not null default '{}',
  cc_addresses      text[] not null default '{}',
  body_text         text not null default '',
  author_id         uuid references public.profiles(id) on delete set null,
  sent_at           timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  unique (company_id, gmail_message_id),
  check (direction <> 'note' or gmail_message_id is null)
);
create index support_messages_conversation_idx on public.support_messages (conversation_id, sent_at);
create index support_messages_author_idx on public.support_messages (author_id);

create table public.support_saved_replies (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  title       text not null check (length(trim(title)) between 1 and 120),
  body        text not null check (length(body) between 1 and 10000),
  category    text,
  active      boolean not null default true,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index support_saved_replies_company_idx on public.support_saved_replies (company_id, active);
create index support_saved_replies_created_by_idx on public.support_saved_replies (created_by);

-- Where the mail sync left off, per mailbox. Server only.
create table public.support_sync_state (
  company_id      uuid not null references public.companies(id) on delete cascade,
  mailbox         text not null,
  history_id      text,
  last_synced_at  timestamptz,
  last_error      text,
  primary key (company_id, mailbox)
);

create trigger support_conversations_updated_at before update on public.support_conversations
  for each row execute function private.set_updated_at();
create trigger support_saved_replies_updated_at before update on public.support_saved_replies
  for each row execute function private.set_updated_at();

alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_saved_replies enable row level security;
alter table public.support_sync_state enable row level security;

grant select, update on public.support_conversations to authenticated;
grant select, insert on public.support_messages to authenticated;
grant select, insert, update on public.support_saved_replies to authenticated;
grant all on public.support_conversations, public.support_messages,
  public.support_saved_replies, public.support_sync_state to service_role;

create policy support_conversations_select on public.support_conversations for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_staff()));
create policy support_conversations_update on public.support_conversations for update to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_staff()))
  with check (company_id = (select private.current_company_id()) and (select private.is_staff()));

create policy support_messages_select on public.support_messages for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_staff()));
-- People add notes in their own name. Mail rows come from the server.
create policy support_messages_insert on public.support_messages for insert to authenticated
  with check (
    company_id = (select private.current_company_id()) and (select private.is_staff())
    and direction = 'note' and author_id = (select auth.uid())
    and exists (select 1 from public.support_conversations c
                where c.id = conversation_id and c.company_id = support_messages.company_id)
  );

create policy support_saved_replies_select on public.support_saved_replies for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_staff()));
create policy support_saved_replies_insert on public.support_saved_replies for insert to authenticated
  with check (company_id = (select private.current_company_id()) and (select private.is_staff())
              and created_by = (select auth.uid()));
create policy support_saved_replies_update on public.support_saved_replies for update to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_staff()))
  with check (company_id = (select private.current_company_id()) and (select private.is_staff()));

-- A person may change who has a conversation, its status, its category and
-- the league or job it belongs to. The mail facts are the server's. Closing
-- stamps who and when; reopening clears it. Mail arriving for a conversation
-- updates it from the message trigger, which this guard lets through.
create or replace function private.guard_support_conversation()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- pg_trigger_depth() is 1 for a direct update. The message trigger below
  -- updates from depth 2, and is the only other writer.
  if auth.uid() is not null and pg_trigger_depth() = 1 and (
       new.id, new.company_id, new.mailbox, new.gmail_thread_id, new.subject, new.customer_email,
       new.customer_name, new.first_message_at, new.last_message_at, new.last_inbound_at,
       new.first_response_at, new.created_at
     ) is distinct from (
       old.id, old.company_id, old.mailbox, old.gmail_thread_id, old.subject, old.customer_email,
       old.customer_name, old.first_message_at, old.last_message_at, old.last_inbound_at,
       old.first_response_at, old.created_at
     ) then
    raise exception 'only the assignee, status, category, league and job of a conversation can be changed';
  end if;
  if new.status = 'closed' and old.status <> 'closed' then
    new.closed_at := now();
    new.closed_by := auth.uid();
  elsif new.status <> 'closed' then
    new.closed_at := null;
    new.closed_by := null;
  else
    new.closed_at := old.closed_at;
    new.closed_by := old.closed_by;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_support_conversation() from public;
create trigger support_conversations_guard before update on public.support_conversations
  for each row execute function private.guard_support_conversation();

-- Each message moves its conversation: mail in reopens a closed or waiting
-- conversation, the first mail out stamps the first response time. A note
-- changes nothing.
create or replace function private.support_message_added()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.direction = 'note' then
    return new;
  end if;
  update public.support_conversations c set
    first_message_at  = least(coalesce(c.first_message_at, new.sent_at), new.sent_at),
    last_message_at   = greatest(coalesce(c.last_message_at, new.sent_at), new.sent_at),
    last_inbound_at   = case when new.direction = 'in'
                             then greatest(coalesce(c.last_inbound_at, new.sent_at), new.sent_at)
                             else c.last_inbound_at end,
    first_response_at = case when new.direction = 'out' and c.first_response_at is null
                             then new.sent_at else c.first_response_at end,
    status            = case
                          when new.direction = 'in' and c.status in ('closed', 'waiting_customer')
                               and new.sent_at >= coalesce(c.last_message_at, new.sent_at) then 'open'
                          when new.direction = 'out' and c.status = 'new' then 'open'
                          else c.status end
  where c.id = new.conversation_id;
  return new;
end;
$$;
revoke all on function private.support_message_added() from public;
create trigger support_messages_added after insert on public.support_messages
  for each row execute function private.support_message_added();

-- Conversations are not copied into the activity log: every message would add
-- a row, and the log would repeat what parents wrote. closed_by and the notes
-- carry who did what.
create trigger support_saved_replies_log after insert or update or delete on public.support_saved_replies
  for each row execute function private.log_row_change();
