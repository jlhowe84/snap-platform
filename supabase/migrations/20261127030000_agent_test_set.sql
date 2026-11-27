-- =============================================================================
-- The agent test set (spec: How SNAP learns, "A test set guards every change").
--
--   eval_cases  past cases with the right answer. A support case holds the
--               conversation as it stood before staff replied, and the reply
--               staff actually sent. Trick cases are written to make the
--               drafter misbehave and say what it must never do.
--   eval_runs   one run of the set: the model used, each case's draft,
--               whether it passed and why, and what the run cost.
--
-- Cases hold customers' words, so only an owner or admin reads or changes
-- them, and nothing here is visible to the office, support, crew,
-- coordinators or anyone signed out. A case is copied from a conversation by
-- add_eval_case_from_conversation, so the words never leave the database.
-- =============================================================================

create table public.eval_cases (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid not null references public.companies(id) on delete cascade,
  kind                    text not null default 'support_reply' check (kind in ('support_reply')),
  title                   text not null check (length(btrim(title)) between 1 and 200),
  tags                    text[] not null default '{}',
  -- {subject, customer_name, customer_email, messages: [{direction, from_name, body_text, sent_at}]}
  input                   jsonb not null check (jsonb_typeof(input) = 'object'),
  -- {approved_reply?, must_not?: [{pattern, why}], must_note?: boolean, notes?}
  expected                jsonb not null default '{}'::jsonb check (jsonb_typeof(expected) = 'object'),
  source_conversation_id  uuid references public.support_conversations(id) on delete set null,
  active                  boolean not null default true,
  created_by              uuid references public.profiles(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index eval_cases_company_idx on public.eval_cases (company_id, created_at);
create index eval_cases_source_idx on public.eval_cases (source_conversation_id);
create index eval_cases_created_by_idx on public.eval_cases (created_by);
create unique index eval_cases_one_per_conversation on public.eval_cases (source_conversation_id) where source_conversation_id is not null;

create table public.eval_runs (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  kind         text not null default 'support_reply' check (kind in ('support_reply')),
  model        text not null,
  judge_model  text not null,
  status       text not null default 'running' check (status in ('running', 'done', 'stopped')),
  case_ids     uuid[] not null default '{}',
  passed       int not null default 0,
  failed       int not null default 0,
  cost_usd     numeric(10, 4) not null default 0,
  -- [{case_id, title, pass, problems: [text], judge: {verdict, reason}, draft}]
  results      jsonb not null default '[]'::jsonb check (jsonb_typeof(results) = 'array'),
  note         text check (char_length(note) <= 500),
  started_by   uuid references public.profiles(id) on delete set null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create index eval_runs_company_idx on public.eval_runs (company_id, started_at desc);
create index eval_runs_started_by_idx on public.eval_runs (started_by);

create trigger eval_cases_updated_at before update on public.eval_cases
  for each row execute function private.set_updated_at();

alter table public.eval_cases enable row level security;
alter table public.eval_runs enable row level security;
grant select, insert, update, delete on public.eval_cases to authenticated;
grant select, insert, update on public.eval_runs to authenticated;
grant all on public.eval_cases, public.eval_runs to service_role;

create policy eval_cases_select on public.eval_cases for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));
create policy eval_cases_insert on public.eval_cases for insert to authenticated
  with check (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));
create policy eval_cases_update on public.eval_cases for update to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()))
  with check (company_id = (select private.current_company_id()));
create policy eval_cases_delete on public.eval_cases for delete to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));

create policy eval_runs_select on public.eval_runs for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));
create policy eval_runs_insert on public.eval_runs for insert to authenticated
  with check (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));
create policy eval_runs_update on public.eval_runs for update to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()))
  with check (company_id = (select private.current_company_id()));

-- Copies a support conversation into the test set: everything before the
-- latest reply staff sent is the input, and that reply is the right answer.
create or replace function public.add_eval_case_from_conversation(p_conversation uuid, p_title text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.current_company_id();
  v_conv    public.support_conversations%rowtype;
  v_reply   public.support_messages%rowtype;
  v_msgs    jsonb;
  v_id      uuid;
begin
  if not private.is_owner_or_admin() then
    raise exception 'only an owner or admin can add to the test set';
  end if;
  select * into v_conv from public.support_conversations where id = p_conversation and company_id = v_company;
  if not found then
    raise exception 'conversation not found';
  end if;
  select * into v_reply from public.support_messages
  where conversation_id = p_conversation and direction = 'out' and length(btrim(coalesce(body_text, ''))) > 0
  order by sent_at desc limit 1;
  if not found then
    raise exception 'this conversation has no reply from us to learn from yet';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'direction', m.direction, 'from_name', m.from_name, 'body_text', m.body_text, 'sent_at', m.sent_at)
           order by m.sent_at), '[]'::jsonb)
    into v_msgs
  from public.support_messages m
  where m.conversation_id = p_conversation and m.sent_at < v_reply.sent_at;
  if not exists (select 1 from jsonb_array_elements(v_msgs) e where e ->> 'direction' = 'in') then
    raise exception 'there is no customer message before our reply';
  end if;

  insert into public.eval_cases (company_id, title, tags, input, expected, source_conversation_id, created_by)
  values (v_company,
          left(coalesce(nullif(btrim(p_title), ''), nullif(btrim(v_conv.subject), ''), 'Support reply'), 200),
          '{real}',
          jsonb_build_object('subject', v_conv.subject, 'customer_name', v_conv.customer_name,
                             'customer_email', v_conv.customer_email, 'messages', v_msgs),
          jsonb_build_object('approved_reply', v_reply.body_text),
          p_conversation, auth.uid())
  on conflict (source_conversation_id) where source_conversation_id is not null
  do update set input = excluded.input, expected = excluded.expected, updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.add_eval_case_from_conversation(uuid, text) from public, anon;
grant execute on function public.add_eval_case_from_conversation(uuid, text) to authenticated;
