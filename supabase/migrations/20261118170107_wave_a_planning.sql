-- =============================================================================
-- Wave A, planning side (spec modules 4, 5, 6, 14 and the agent core; data
-- model groups Planning and Ledger and events): planning forms, teams,
-- roster files and versions, schedules and slots, portal links, the job
-- message thread, agent events, and the readiness view.
--
-- Readiness is computed from these records, never typed (principle 3).
-- Coordinators reach only their own job's rows, and only the parts the spec
-- lets them write: the planning form, roster uploads, teams and the schedule.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Planning form (portal step 3; replaces the Tally form)
-- ---------------------------------------------------------------------------
create table public.planning_forms (
  job_id        uuid primary key references public.jobs(id) on delete cascade,
  company_id    uuid not null references public.companies(id) on delete cascade,
  sent_at       timestamptz,
  answers       jsonb not null default '{}'::jsonb,
  submitted_at  timestamptz,
  submitted_by  uuid references public.profiles(id) on delete set null,
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Teams, rosters and their versions (module 5)
-- ---------------------------------------------------------------------------
create table public.teams (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  job_id        uuid not null references public.jobs(id) on delete cascade,
  name          text not null,
  division      text,
  sport         text,
  coach_name    text,
  sponsor       text,
  player_count  int check (player_count >= 0),
  tc_number     text,               -- team card number on the schedule
  source        text not null default 'office' check (source in ('roster', 'schedule', 'coordinator', 'office', 'last_season')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (job_id, name, division)
);
create index teams_job_idx on public.teams (job_id);

create table public.roster_files (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  job_id        uuid not null references public.jobs(id) on delete cascade,
  storage_path  text not null,
  file_name     text not null,
  mime_type     text not null,
  size_bytes    bigint not null check (size_bytes > 0 and size_bytes <= 26214400),   -- 25 MB
  source        text not null default 'portal' check (source in ('portal', 'email', 'office', 'checkin')),
  uploaded_by   uuid references public.profiles(id) on delete set null,
  uploaded_at   timestamptz not null default now()
);
create index roster_files_job_idx on public.roster_files (job_id, uploaded_at desc);

create table public.roster_versions (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid not null references public.companies(id) on delete cascade,
  job_id                  uuid not null references public.jobs(id) on delete cascade,
  version                 int not null check (version > 0),
  file_ids                uuid[] not null default '{}',
  status                  text not null default 'processing'
                          check (status in ('processing', 'needs_answers', 'ready', 'uploaded', 'superseded', 'failed')),
  csv_path                text,               -- the standardized Captura CSV
  subject_count           int,
  team_count              int,
  questions               jsonb,              -- what the worker could not settle
  diff                    jsonb,              -- against the previous version / what is in Captura
  uploaded_to_captura_at  timestamptz,
  captura_subject_count   int,                -- read back from the gallery to confirm the upload
  error                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (job_id, version)
);

-- ---------------------------------------------------------------------------
-- Schedules (module 6): one per photo day, slots per station.
-- ---------------------------------------------------------------------------
create table public.schedules (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  job_id         uuid not null references public.jobs(id) on delete cascade,
  photo_day_id   uuid not null unique references public.photo_days(id) on delete cascade,
  status         text not null default 'not_started'
                 check (status in ('not_started', 'link_sent', 'started', 'submitted', 'complete')),
  stations       smallint not null default 2 check (stations between 1 and 20),
  default_block_minutes smallint not null default 15 check (default_block_minutes between 5 and 60),
  link_sent_at   timestamptz,
  submitted_at   timestamptz,
  submitted_by   uuid references public.profiles(id) on delete set null,
  updated_at     timestamptz not null default now()
);
create index schedules_job_idx on public.schedules (job_id);

create table public.schedule_slots (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  job_id       uuid not null references public.jobs(id) on delete cascade,
  schedule_id  uuid not null references public.schedules(id) on delete cascade,
  station      smallint not null check (station >= 1),
  starts_at    time not null,
  minutes      smallint not null check (minutes between 5 and 60),
  kind         text not null default 'team' check (kind in ('team', 'break')),
  team_id      uuid references public.teams(id) on delete set null,
  label        text,
  created_at   timestamptz not null default now(),
  check (kind = 'break' or team_id is not null or label is not null)
);
create index schedule_slots_schedule_idx on public.schedule_slots (schedule_id, station, starts_at);
create index schedule_slots_team_idx on public.schedule_slots (team_id);

-- A slot's job must match its schedule's job (the policies trust job_id).
create or replace function private.check_slot_job()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.schedules s where s.id = new.schedule_id and s.job_id = new.job_id) then
    raise exception 'slot job does not match its schedule';
  end if;
  if new.team_id is not null
     and not exists (select 1 from public.teams t where t.id = new.team_id and t.job_id = new.job_id) then
    raise exception 'slot team belongs to another job';
  end if;
  return new;
end;
$$;
revoke all on function private.check_slot_job() from public;
create trigger schedule_slots_check before insert or update on public.schedule_slots
  for each row execute function private.check_slot_job();

-- ---------------------------------------------------------------------------
-- Portal links (module 14): one per job, reusable until it expires. Only the
-- hash of the token is stored; the server mints a scoped session from it.
-- ---------------------------------------------------------------------------
create table public.portal_links (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  job_id        uuid not null references public.jobs(id) on delete cascade,
  contact_id    uuid references public.contacts(id) on delete set null,
  token_hash    text not null unique,
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  last_used_at  timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index portal_links_job_idx on public.portal_links (job_id);

-- The job's message thread, shared by the office and the coordinators.
-- (Wave B folds this into conversations with email and chat.)
create table public.job_messages (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  job_id       uuid not null references public.jobs(id) on delete cascade,
  author_id    uuid references public.profiles(id) on delete set null,
  author_kind  text not null check (author_kind in ('staff', 'coordinator', 'agent', 'system')),
  body         text not null check (length(body) between 1 and 20000),
  internal     boolean not null default false,   -- staff-only note
  created_at   timestamptz not null default now()
);
create index job_messages_job_idx on public.job_messages (job_id, created_at);

-- ---------------------------------------------------------------------------
-- What wakes the agent (The AI core): portal actions, the clock, mail,
-- Captura changes. Written by the server and by triggers; staff read.
-- ---------------------------------------------------------------------------
create table public.agent_events (
  id            bigint generated always as identity primary key,
  company_id    uuid not null references public.companies(id) on delete cascade,
  kind          text not null check (kind ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$'),
  job_id        uuid references public.jobs(id) on delete cascade,
  org_id        uuid references public.organizations(id) on delete cascade,
  payload       jsonb not null default '{}'::jsonb,
  occurred_at   timestamptz not null default now(),
  processed_at  timestamptz,
  run_id        uuid references public.agent_runs(id) on delete set null
);
create index agent_events_pending_idx on public.agent_events (company_id, occurred_at) where processed_at is null;
create index agent_events_job_idx on public.agent_events (job_id);

create or replace function private.emit_event(p_company uuid, p_kind text, p_job uuid, p_payload jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.agent_events (company_id, kind, job_id, payload) values (p_company, p_kind, p_job, p_payload)
$$;
revoke all on function private.emit_event(uuid, text, uuid, jsonb) from public;

create or replace function private.planning_events()
returns trigger language plpgsql security definer set search_path = '' as $$
-- One branch per table: plpgsql resolves record fields when an expression is
-- planned, so a condition may only name columns of its own table.
begin
  case tg_table_name
    when 'roster_files' then
      perform private.emit_event(new.company_id, 'roster.uploaded', new.job_id,
        jsonb_build_object('roster_file_id', new.id, 'source', new.source));
    when 'planning_forms' then
      if new.submitted_at is not null then
        if tg_op = 'INSERT' then
          perform private.emit_event(new.company_id, 'planning_form.submitted', new.job_id, '{}'::jsonb);
        elsif old.submitted_at is null then
          perform private.emit_event(new.company_id, 'planning_form.submitted', new.job_id, '{}'::jsonb);
        end if;
      end if;
    when 'schedules' then
      if new.status is distinct from old.status then
        perform private.emit_event(new.company_id, 'schedule.' || new.status, new.job_id,
          jsonb_build_object('schedule_id', new.id));
      end if;
    when 'agreement_signatures' then
      perform private.emit_event(new.company_id, 'agreement.signed', new.job_id,
        jsonb_build_object('signature_id', new.id, 'version_id', new.version_id));
    when 'job_messages' then
      if new.author_kind = 'coordinator' then
        perform private.emit_event(new.company_id, 'portal.message', new.job_id,
          jsonb_build_object('message_id', new.id));
      end if;
    else
      null;
  end case;
  return null;
end;
$$;
revoke all on function private.planning_events() from public;

create trigger roster_files_event after insert on public.roster_files
  for each row execute function private.planning_events();
create trigger planning_forms_event after insert or update on public.planning_forms
  for each row execute function private.planning_events();
create trigger schedules_event after update on public.schedules
  for each row execute function private.planning_events();
create trigger agreement_signatures_event after insert on public.agreement_signatures
  for each row execute function private.planning_events();
create trigger job_messages_event after insert on public.job_messages
  for each row execute function private.planning_events();

-- ---------------------------------------------------------------------------
-- Readiness, one row per photo day, computed from the records (module 4).
-- ---------------------------------------------------------------------------
create view public.photo_day_readiness with (security_invoker = true) as
select
  pd.id                         as photo_day_id,
  pd.company_id,
  pd.job_id,
  pd.date,
  j.status                      as job_status,
  exists (select 1 from public.agreement_signatures s where s.job_id = j.id) as agreement_signed,
  case
    when pf.submitted_at is not null then 'submitted'
    when pf.sent_at is not null then 'sent'
    else 'not_sent'
  end                           as planning_form,
  case
    when exists (select 1 from public.roster_versions v where v.job_id = j.id and v.status = 'uploaded') then 'uploaded'
    when exists (select 1 from public.roster_versions v where v.job_id = j.id and v.status = 'ready') then 'standardized'
    when exists (select 1 from public.roster_files f where f.job_id = j.id) then 'received'
    else 'not_received'
  end                           as roster,
  coalesce(sc.status, 'not_started') as schedule,
  jl.captura_gallery_id is not null  as captura_gallery
from public.photo_days pd
join public.jobs j on j.id = pd.job_id
left join public.planning_forms pf on pf.job_id = j.id
left join public.schedules sc on sc.photo_day_id = pd.id
left join public.job_links jl on jl.job_id = j.id;
grant select on public.photo_day_readiness to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Triggers, RLS, grants
-- ---------------------------------------------------------------------------
create trigger planning_forms_updated_at before update on public.planning_forms
  for each row execute function private.set_updated_at();
create trigger teams_updated_at before update on public.teams
  for each row execute function private.set_updated_at();
create trigger roster_versions_updated_at before update on public.roster_versions
  for each row execute function private.set_updated_at();
create trigger schedules_updated_at before update on public.schedules
  for each row execute function private.set_updated_at();

create trigger planning_forms_log after insert or update on public.planning_forms
  for each row execute function private.log_row_change();
create trigger teams_log after insert or update or delete on public.teams
  for each row execute function private.log_row_change();
create trigger roster_files_log after insert or delete on public.roster_files
  for each row execute function private.log_row_change();
create trigger roster_versions_log after insert or update on public.roster_versions
  for each row execute function private.log_row_change();
create trigger schedules_log after insert or update on public.schedules
  for each row execute function private.log_row_change();
create trigger portal_links_log after insert or update on public.portal_links
  for each row execute function private.log_row_change();

alter table public.planning_forms  enable row level security;
alter table public.teams           enable row level security;
alter table public.roster_files    enable row level security;
alter table public.roster_versions enable row level security;
alter table public.schedules       enable row level security;
alter table public.schedule_slots  enable row level security;
alter table public.portal_links    enable row level security;
alter table public.job_messages    enable row level security;
alter table public.agent_events    enable row level security;

grant select, insert, update, delete on public.planning_forms, public.teams, public.roster_files,
  public.roster_versions, public.schedules, public.schedule_slots, public.portal_links,
  public.job_messages to authenticated;
grant select on public.agent_events to authenticated;
grant all on public.planning_forms, public.teams, public.roster_files, public.roster_versions,
  public.schedules, public.schedule_slots, public.portal_links, public.job_messages,
  public.agent_events to service_role;

-- Everything job-scoped is readable by staff and that job's coordinators.
do $$
declare
  t text;
begin
  foreach t in array array['planning_forms', 'teams', 'roster_files', 'roster_versions', 'schedules', 'schedule_slots'] loop
    execute format($p$create policy %1$s_select on public.%1$I for select to authenticated
      using ((select private.can_see_job(job_id)))$p$, t);
  end loop;
end;
$$;

-- Office writes everything job-scoped; owner and admin delete.
do $$
declare
  t text;
begin
  foreach t in array array['planning_forms', 'teams', 'roster_files', 'roster_versions', 'schedules', 'schedule_slots'] loop
    execute format($p$create policy %1$s_insert_ops on public.%1$I for insert to authenticated
      with check (company_id = (select private.current_company_id()) and (select private.can_edit_ops()))$p$, t);
    -- WITH CHECK repeats the role test: Postgres ORs the checks of every
    -- update policy, so a company-only check here would let a coordinator
    -- past the limits of their own policy.
    execute format($p$create policy %1$s_update_ops on public.%1$I for update to authenticated
      using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()))
      with check (company_id = (select private.current_company_id()) and (select private.can_edit_ops()))$p$, t);
    execute format($p$create policy %1$s_delete_ops on public.%1$I for delete to authenticated
      using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()))$p$, t);
  end loop;
end;
$$;

-- The coordinator-writable surface (kept minimal and explicit):
--   planning form answers; roster uploads; teams; schedule slots; schedule
--   status up to 'started' (submitting goes through submit_schedule()).
create policy planning_forms_update_coord on public.planning_forms for update to authenticated
  using ((select private.is_job_coordinator(job_id)))
  with check ((select private.is_job_coordinator(job_id)) and company_id = (select private.current_company_id()));
create policy roster_files_insert_coord on public.roster_files for insert to authenticated
  with check ((select private.is_job_coordinator(job_id)) and company_id = (select private.current_company_id())
              and uploaded_by = (select auth.uid()) and source = 'portal');
create policy teams_insert_coord on public.teams for insert to authenticated
  with check ((select private.is_job_coordinator(job_id)) and company_id = (select private.current_company_id())
              and source = 'coordinator');
create policy teams_update_coord on public.teams for update to authenticated
  using ((select private.is_job_coordinator(job_id)))
  with check ((select private.is_job_coordinator(job_id)) and company_id = (select private.current_company_id()));
create policy teams_delete_coord on public.teams for delete to authenticated
  using ((select private.is_job_coordinator(job_id)) and source = 'coordinator');
create policy schedule_slots_insert_coord on public.schedule_slots for insert to authenticated
  with check ((select private.is_job_coordinator(job_id)) and company_id = (select private.current_company_id()));
create policy schedule_slots_update_coord on public.schedule_slots for update to authenticated
  using ((select private.is_job_coordinator(job_id)))
  with check ((select private.is_job_coordinator(job_id)) and company_id = (select private.current_company_id()));
create policy schedule_slots_delete_coord on public.schedule_slots for delete to authenticated
  using ((select private.is_job_coordinator(job_id)));
create policy schedules_update_coord on public.schedules for update to authenticated
  using ((select private.is_job_coordinator(job_id)))
  with check ((select private.is_job_coordinator(job_id)) and company_id = (select private.current_company_id())
              and status in ('not_started', 'link_sent', 'started'));

-- RLS cannot see which columns changed, so a coordinator's update is limited
-- to the columns named in the trigger arguments. The office and the server
-- (no signed-in person) are not limited.
create or replace function private.limit_coordinator_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_allowed text[] := tg_argv;
begin
  if auth.uid() is null or private.can_edit_ops() then
    return new;
  end if;
  if (to_jsonb(new) - v_allowed - 'updated_at') is distinct from (to_jsonb(old) - v_allowed - 'updated_at') then
    raise exception 'coordinators may change only: %', array_to_string(v_allowed, ', ');
  end if;
  return new;
end;
$$;
revoke all on function private.limit_coordinator_update() from public;
create trigger planning_forms_coord_limit before update on public.planning_forms
  for each row execute function private.limit_coordinator_update('answers', 'submitted_at', 'submitted_by');
create trigger teams_coord_limit before update on public.teams
  for each row execute function private.limit_coordinator_update('name', 'division', 'sport', 'coach_name', 'sponsor', 'player_count');
create trigger schedule_slots_coord_limit before update on public.schedule_slots
  for each row execute function private.limit_coordinator_update('station', 'starts_at', 'minutes', 'kind', 'team_id', 'label');
create trigger schedules_coord_limit before update on public.schedules
  for each row execute function private.limit_coordinator_update('status', 'default_block_minutes', 'submitted_at', 'submitted_by');

-- Portal links: office only. Coordinators never see tokens or hashes.
create policy portal_links_select on public.portal_links for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()));
create policy portal_links_insert on public.portal_links for insert to authenticated
  with check (company_id = (select private.current_company_id()) and (select private.can_edit_ops()));
create policy portal_links_update on public.portal_links for update to authenticated
  using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()))
  with check (company_id = (select private.current_company_id()));

-- Messages: staff see all on jobs they can see; coordinators see the
-- non-internal ones on their job and post as themselves.
create policy job_messages_select on public.job_messages for select to authenticated
  using ((select private.can_see_job(job_id)) and ((select private.is_staff()) or not internal));
create policy job_messages_insert_staff on public.job_messages for insert to authenticated
  with check (company_id = (select private.current_company_id()) and (select private.is_staff())
              and author_id = (select auth.uid()) and author_kind = 'staff');
create policy job_messages_insert_coord on public.job_messages for insert to authenticated
  with check ((select private.is_job_coordinator(job_id)) and company_id = (select private.current_company_id())
              and author_id = (select auth.uid()) and author_kind = 'coordinator' and not internal);

create policy agent_events_select on public.agent_events for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_staff()));

-- ---------------------------------------------------------------------------
-- Submitting a schedule: blocked unless complete (module 6). Every team on
-- the job has a slot, and no two slots on a station overlap.
-- ---------------------------------------------------------------------------
create or replace function public.schedule_problems(p_schedule_id uuid)
returns table (problem text, detail text)
language sql stable security definer set search_path = '' as $$
  with s as (
    select * from public.schedules where id = p_schedule_id and private.can_see_job(job_id)
  )
  select 'missing_team', t.name
  from s join public.teams t on t.job_id = s.job_id
  where not exists (select 1 from public.schedule_slots x
                    join public.schedules s2 on s2.id = x.schedule_id
                    where x.team_id = t.id and s2.job_id = s.job_id)
  union all
  select 'overlap', format('station %s at %s', a.station, to_char(b.starts_at, 'HH24:MI'))
  from s
  join public.schedule_slots a on a.schedule_id = s.id
  join public.schedule_slots b on b.schedule_id = s.id and b.station = a.station and b.id <> a.id
   and b.starts_at >= a.starts_at and b.starts_at < a.starts_at + make_interval(mins => a.minutes)
   and (b.starts_at > a.starts_at or b.id > a.id)
  union all
  select 'station_out_of_range', format('station %s', x.station)
  from s join public.schedule_slots x on x.schedule_id = s.id
  where x.station > s.stations
  union all
  select 'no_teams', null from s where not exists (select 1 from public.teams t where t.job_id = s.job_id)
$$;
revoke all on function public.schedule_problems(uuid) from public;
grant execute on function public.schedule_problems(uuid) to authenticated, service_role;

create or replace function public.submit_schedule(p_schedule_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_job uuid;
begin
  select job_id into v_job from public.schedules where id = p_schedule_id;
  if v_job is null or not (private.is_job_coordinator(v_job) or private.can_edit_ops()) then
    raise exception 'not allowed to submit this schedule';
  end if;
  if exists (select 1 from public.schedule_problems(p_schedule_id)) then
    raise exception 'schedule is not complete';
  end if;
  update public.schedules
  set status = 'submitted', submitted_at = now(), submitted_by = auth.uid()
  where id = p_schedule_id;
  return 'submitted';
end;
$$;
revoke all on function public.submit_schedule(uuid) from public;
grant execute on function public.submit_schedule(uuid) to authenticated, service_role;
