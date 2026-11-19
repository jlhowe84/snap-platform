-- Notices (module 17, the in-app basics). A notice is one line for one person,
-- written by a trigger when something needs them. The default is quiet: only
-- three kinds exist, and each person can turn a kind off. Email, Google Chat
-- and text delivery come later and will pass lib/mail/guard.ts.

create table public.notices (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('task.assigned', 'date.changed', 'queue.at_risk')),
  title       text not null,
  detail      text,
  href        text check (href is null or href ~ '^/[a-z0-9/_?=&-]*$'),
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notices_person_idx on public.notices (profile_id, created_at desc);
create index notices_unread_idx on public.notices (profile_id) where read_at is null;
create index notices_company_idx on public.notices (company_id);

-- One row per kind a person has turned off. No row means on.
create table public.notice_mutes (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  kind        text not null check (kind in ('task.assigned', 'date.changed', 'queue.at_risk')),
  created_at  timestamptz not null default now(),
  primary key (profile_id, kind)
);
create index notice_mutes_company_idx on public.notice_mutes (company_id);

alter table public.notices enable row level security;
alter table public.notice_mutes enable row level security;
grant select, update on public.notices to authenticated;
grant select, insert, delete on public.notice_mutes to authenticated;
grant all on public.notices, public.notice_mutes to service_role;

-- A person sees and marks only their own notices. Nobody writes one by hand.
create policy notices_select on public.notices for select to authenticated
  using (profile_id = (select auth.uid()) and company_id = (select private.current_company_id()));
create policy notices_update on public.notices for update to authenticated
  using (profile_id = (select auth.uid()) and company_id = (select private.current_company_id()))
  with check (profile_id = (select auth.uid()) and company_id = (select private.current_company_id()));

create policy notice_mutes_select on public.notice_mutes for select to authenticated
  using (profile_id = (select auth.uid()));
create policy notice_mutes_insert on public.notice_mutes for insert to authenticated
  with check (profile_id = (select auth.uid()) and company_id = (select private.current_company_id())
              and (select private.is_staff()));
create policy notice_mutes_delete on public.notice_mutes for delete to authenticated
  using (profile_id = (select auth.uid()));

-- Marking read is the only change a person can make to a notice.
create or replace function private.guard_notice_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and (new.id, new.company_id, new.profile_id, new.kind, new.title, new.detail, new.href, new.created_at)
       is distinct from (old.id, old.company_id, old.profile_id, old.kind, old.title, old.detail, old.href, old.created_at) then
    raise exception 'a notice can only be marked read';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_notice_update() from public;
create trigger notices_guard before update on public.notices
  for each row execute function private.guard_notice_update();

-- Writes one notice, unless the person is the one who did it, is inactive,
-- is not in the company, or has turned that kind off.
create or replace function private.notify(
  p_company uuid, p_profile uuid, p_kind text, p_title text, p_detail text, p_href text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_profile is null or p_profile = auth.uid() then
    return;
  end if;
  insert into public.notices (company_id, profile_id, kind, title, detail, href)
  select p_company, p.id, p_kind, left(p_title, 200), left(p_detail, 500), p_href
  from public.profiles p
  where p.id = p_profile and p.company_id = p_company and p.active
    and not exists (select 1 from public.notice_mutes m where m.profile_id = p.id and m.kind = p_kind);
end;
$$;
revoke all on function private.notify(uuid, uuid, text, text, text, text) from public;

-- 1. A task someone else gave you.
create or replace function private.notice_task_assigned()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.assignee_id is not null and new.status not in ('done', 'cancelled')
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform private.notify(new.company_id, new.assignee_id, 'task.assigned', new.title,
      case when new.due_on is not null then 'Due ' || to_char(new.due_on, 'Dy Mon DD') end,
      case when new.job_id is not null then '/jobs/' || new.job_id else '/tasks' end);
  end if;
  return new;
end;
$$;
revoke all on function private.notice_task_assigned() from public;
create trigger tasks_notice after insert or update of assignee_id on public.tasks
  for each row execute function private.notice_task_assigned();

-- 2. A photo day moved, was postponed or was cancelled: the office and the
--    other owners and admins hear about it.
create or replace function private.notice_date_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_job  text;
  v_what text;
  r      record;
begin
  select name into v_job from public.jobs where id = new.job_id;
  v_what := case new.kind
    when 'reschedule' then 'moved from ' || to_char(new.from_date, 'Dy Mon DD') || ' to ' || to_char(new.to_date, 'Dy Mon DD')
    when 'postpone'   then 'postponed (was ' || to_char(new.from_date, 'Dy Mon DD') || ')'
    else                   'cancelled (was ' || to_char(new.from_date, 'Dy Mon DD') || ')' end;
  for r in
    select distinct pr.profile_id from public.profile_roles pr
    where pr.company_id = new.company_id and pr.role in ('owner', 'admin', 'office')
  loop
    perform private.notify(new.company_id, r.profile_id, 'date.changed',
      coalesce(v_job, 'A photo day') || ' ' || v_what, new.reason, '/jobs/' || new.job_id);
  end loop;
  return new;
end;
$$;
revoke all on function private.notice_date_changed() from public;
create trigger date_changes_notice after insert on public.date_changes
  for each row execute function private.notice_date_changed();

-- 3. A date-at-risk note is waiting: only an owner or admin can decide it.
create or replace function private.notice_at_risk()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if new.action_type_key = 'chase.at_risk' and new.status = 'proposed' then
    for r in
      select distinct pr.profile_id from public.profile_roles pr
      where pr.company_id = new.company_id and pr.role in ('owner', 'admin')
    loop
      perform private.notify(new.company_id, r.profile_id, 'queue.at_risk',
        'A date-at-risk note is waiting for you', new.draft ->> 'subject', '/queue');
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function private.notice_at_risk() from public;
create trigger agent_actions_notice after insert on public.agent_actions
  for each row execute function private.notice_at_risk();
