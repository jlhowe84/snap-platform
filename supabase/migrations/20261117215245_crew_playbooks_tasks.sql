-- =============================================================================
-- Crew directory, playbooks (from Notion Job Task Templates) and tasks.
-- Shifts, offers, pay and kits arrive with module 7 and 8 in Wave B.
-- =============================================================================

create table public.crew_members (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  profile_id      uuid unique references public.profiles(id) on delete set null,
  full_name       text not null,
  email           text,
  phone           text,
  city            text,
  state           text,
  positions       text[] not null default '{}'
                  check (positions <@ array['photographer', 'poser', 'coordinator', 'photo_attendant', 'office']),
  level           smallint check (level between 1 and 5),   -- priority level for offer waves
  active          boolean not null default true,
  notes           text,
  notion_page_id  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (company_id, notion_page_id)
);
create index crew_members_company_idx on public.crew_members (company_id, active);

create table public.playbooks (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  key         text not null check (key ~ '^[a-z0-9_]+$'),
  name        text not null,
  kind        text not null check (kind in ('planning', 'production')),
  version     int not null default 1,
  active      boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, key)
);

-- One step of a playbook. Imported steps keep Notion's owner names and offset
-- text as hints; owners, timing and evidence rules are set with Josh in the
-- playbook session (Dec 12), so evidence_rule starts empty.
create table public.playbook_steps (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  playbook_id     uuid not null references public.playbooks(id) on delete cascade,
  position        numeric not null,
  name            text not null,
  description     text,
  stage           text,
  offset_text     text,          -- as written in Notion: "+3d", "-14d", "none"
  offset_days     int,           -- parsed from offset_text, relative to the photo day
  owner_hint      text,
  priority        text,
  tags            text[] not null default '{}',
  evidence_rule   jsonb,
  active          boolean not null default true,
  notion_page_id  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (company_id, notion_page_id)
);
create index playbook_steps_playbook_idx on public.playbook_steps (playbook_id, position);

create type public.task_status as enum ('todo', 'in_progress', 'waiting', 'done', 'cancelled');

-- One task list for playbook steps and one-off office work (module 17): a task
-- can belong to a job, a league, a person or nothing at all.
create table public.tasks (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  job_id            uuid references public.jobs(id) on delete cascade,
  org_id            uuid references public.organizations(id) on delete set null,
  playbook_step_id  uuid references public.playbook_steps(id) on delete set null,
  title             text not null,
  notes             text,
  status            public.task_status not null default 'todo',
  assignee_id       uuid references public.profiles(id) on delete set null,
  due_on            date,
  completed_at      timestamptz,
  completed_by      uuid references public.profiles(id) on delete set null,
  evidence          jsonb,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index tasks_company_status_idx on public.tasks (company_id, status, due_on);
create index tasks_job_idx on public.tasks (job_id);
create index tasks_assignee_idx on public.tasks (assignee_id) where status not in ('done', 'cancelled');

create trigger crew_members_updated_at before update on public.crew_members
  for each row execute function private.set_updated_at();
create trigger playbooks_updated_at before update on public.playbooks
  for each row execute function private.set_updated_at();
create trigger playbook_steps_updated_at before update on public.playbook_steps
  for each row execute function private.set_updated_at();
create trigger tasks_updated_at before update on public.tasks
  for each row execute function private.set_updated_at();

create trigger crew_members_log after insert or update or delete on public.crew_members
  for each row execute function private.log_row_change();
create trigger playbooks_log after insert or update or delete on public.playbooks
  for each row execute function private.log_row_change();
create trigger playbook_steps_log after insert or update or delete on public.playbook_steps
  for each row execute function private.log_row_change();
create trigger tasks_log after insert or update or delete on public.tasks
  for each row execute function private.log_row_change();

alter table public.crew_members enable row level security;
alter table public.playbooks enable row level security;
alter table public.playbook_steps enable row level security;
alter table public.tasks enable row level security;

grant select, insert, update, delete on public.crew_members, public.playbooks,
  public.playbook_steps, public.tasks to authenticated;
grant all on public.crew_members, public.playbooks, public.playbook_steps, public.tasks to service_role;

-- crew: staff see the directory; a crew member sees their own row only.
create policy crew_members_select on public.crew_members for select to authenticated
  using ((company_id = (select private.current_company_id()) and (select private.is_staff()))
         or profile_id = (select auth.uid()));
create policy crew_members_insert on public.crew_members for insert to authenticated
  with check (company_id = (select private.current_company_id()) and (select private.can_edit_ops()));
create policy crew_members_update on public.crew_members for update to authenticated
  using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()))
  with check (company_id = (select private.current_company_id()));
create policy crew_members_delete on public.crew_members for delete to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));

-- playbooks: staff read; owner and admin change them (settings, module 18).
do $$
declare
  t text;
begin
  foreach t in array array['playbooks', 'playbook_steps'] loop
    execute format($p$create policy %1$s_select on public.%1$I for select to authenticated
      using (company_id = (select private.current_company_id()) and (select private.is_staff()))$p$, t);
    execute format($p$create policy %1$s_insert on public.%1$I for insert to authenticated
      with check (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()))$p$, t);
    execute format($p$create policy %1$s_update on public.%1$I for update to authenticated
      using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()))
      with check (company_id = (select private.current_company_id()))$p$, t);
    execute format($p$create policy %1$s_delete on public.%1$I for delete to authenticated
      using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()))$p$, t);
  end loop;
end;
$$;

-- tasks: any staff role reads and works tasks; owner and admin delete.
create policy tasks_select on public.tasks for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_staff()));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (company_id = (select private.current_company_id()) and (select private.is_staff()));
create policy tasks_update on public.tasks for update to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_staff()))
  with check (company_id = (select private.current_company_id()));
create policy tasks_delete on public.tasks for delete to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));
