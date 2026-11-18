-- =============================================================================
-- Wave A: the portal's planning steps (spec modules 4, 5, 6 and 14).
--   * a private bucket for roster files (CSV, Excel, PDF, images; 25 MB)
--   * roster file paths are pinned to their company and job
--   * save_planning_form(): the coordinator's planning answers, saved or sent
--   * open_schedule(): the schedule for a photo day, made on first use
--   * the final roster and schedule deadline, as a setting (10 days)
-- =============================================================================

-- Roster files hold children's names. The bucket is private and has no
-- policies: the server hands out a short upload or download link only after
-- an RLS check on the job.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('rosters', 'rosters', false, 26214400, array[
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/pdf',
      'image/jpeg',
      'image/png'])
    on conflict (id) do nothing;
  end if;
end;
$$;

-- A roster file row may only point at an object under its own company and
-- job, so a row can never be used to reach another job's file.
alter table public.roster_files
  add constraint roster_files_path_scope
  check (storage_path like company_id::text || '/' || job_id::text || '/%' and storage_path !~ '\.\.')
  not valid;
alter table public.roster_files
  add constraint roster_files_mime
  check (mime_type in ('text/csv', 'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf', 'image/jpeg', 'image/png'))
  not valid;

-- ---------------------------------------------------------------------------
-- Planning form. Coordinators have no insert policy on planning_forms, so
-- the first save goes through here. A coordinator needs a signed agreement
-- first (the portal opens the step then); the office does not.
-- ---------------------------------------------------------------------------
create or replace function public.save_planning_form(p_job_id uuid, p_answers jsonb, p_submit boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid;
  v_coord   boolean := private.is_job_coordinator(p_job_id);
begin
  select company_id into v_company from public.jobs where id = p_job_id;
  if v_company is null or v_company <> private.current_company_id()
     or not (v_coord or private.can_edit_ops()) then
    raise exception 'not allowed to fill in this planning form';
  end if;
  if v_coord and not private.can_edit_ops()
     and not exists (select 1 from public.agreement_signatures s where s.job_id = p_job_id) then
    raise exception 'sign the agreement before the planning form';
  end if;
  if jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 20000 then
    raise exception 'planning answers are not valid';
  end if;

  insert into public.planning_forms (job_id, company_id, answers, submitted_at, submitted_by)
  values (p_job_id, v_company, p_answers,
          case when p_submit then now() end, case when p_submit then auth.uid() end)
  on conflict (job_id) do update
  set answers      = excluded.answers,
      submitted_at = case when p_submit then now() else public.planning_forms.submitted_at end,
      submitted_by = case when p_submit then auth.uid() else public.planning_forms.submitted_by end;

  return case when p_submit then 'submitted' else 'saved' end;
end;
$$;
revoke all on function public.save_planning_form(uuid, jsonb, boolean) from public, anon;
grant execute on function public.save_planning_form(uuid, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Schedules are made on first use, one per photo day.
-- ---------------------------------------------------------------------------
create or replace function public.open_schedule(p_photo_day_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_day   public.photo_days;
  v_id    uuid;
  v_coord boolean;
begin
  select * into v_day from public.photo_days where id = p_photo_day_id;
  v_coord := v_day.job_id is not null and private.is_job_coordinator(v_day.job_id);
  if v_day.id is null or v_day.company_id <> private.current_company_id()
     or not (v_coord or private.can_edit_ops()) then
    raise exception 'not allowed to open this schedule';
  end if;
  if v_coord and not private.can_edit_ops()
     and not exists (select 1 from public.agreement_signatures s where s.job_id = v_day.job_id) then
    raise exception 'sign the agreement before the schedule';
  end if;

  select id into v_id from public.schedules where photo_day_id = p_photo_day_id;
  if v_id is null then
    insert into public.schedules (company_id, job_id, photo_day_id, status)
    values (v_day.company_id, v_day.job_id, p_photo_day_id, 'started')
    on conflict (photo_day_id) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.schedules where photo_day_id = p_photo_day_id;
    end if;
  else
    update public.schedules set status = 'started'
    where id = v_id and status in ('not_started', 'link_sent');
  end if;
  return v_id;
end;
$$;
revoke all on function public.open_schedule(uuid) from public, anon;
grant execute on function public.open_schedule(uuid) to authenticated;

-- A change after submitting sends the schedule back to started, so
-- "submitted" always means "complete as it stands". The office can mark it
-- complete again after its own edits.
create or replace function private.reopen_schedule_on_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.schedules set status = 'started', submitted_at = null, submitted_by = null
  where id = coalesce(new.schedule_id, old.schedule_id) and status in ('submitted', 'complete')
    and not private.can_edit_ops() and auth.uid() is not null;
  return null;
end;
$$;
revoke all on function private.reopen_schedule_on_change() from public;
create trigger schedule_slots_reopen after insert or update or delete on public.schedule_slots
  for each row execute function private.reopen_schedule_on_change();

-- The office marks a submitted schedule complete, or sends it back.
create or replace function public.set_schedule_status(p_schedule_id uuid, p_status text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_edit_ops() or not exists (
    select 1 from public.schedules where id = p_schedule_id and company_id = private.current_company_id()) then
    raise exception 'not allowed to change this schedule';
  end if;
  if p_status not in ('started', 'complete') then
    raise exception 'a schedule can be marked complete or sent back to started';
  end if;
  if p_status = 'complete' and exists (select 1 from public.schedule_problems(p_schedule_id)) then
    raise exception 'schedule is not complete';
  end if;
  update public.schedules set status = p_status where id = p_schedule_id;
  return p_status;
end;
$$;
revoke all on function public.set_schedule_status(uuid, text) from public, anon;
grant execute on function public.set_schedule_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The agreement's deadline: roster and schedule no later than 10 days before
-- photo day, with three weeks (chase.weeks_due) as the date we ask for.
-- ---------------------------------------------------------------------------
create or replace function private.seed_planning_defaults(p_company uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.settings (company_id, key, value) values
    (p_company, 'chase.deadline_days', '10'::jsonb)
  on conflict (company_id, key) do nothing
$$;
revoke all on function private.seed_planning_defaults(uuid) from public, authenticated;

do $$
declare c uuid;
begin
  for c in select id from public.companies loop
    perform private.seed_planning_defaults(c);
  end loop;
end $$;

-- The two planning dates, for the portal (coordinators cannot read settings).
create or replace function public.planning_due(p_job_id uuid)
returns table (weeks_due int, deadline_days int)
language sql stable security definer set search_path = '' as $$
  select private.setting_number(j.company_id, 'chase.weeks_due', 3)::int,
         private.setting_number(j.company_id, 'chase.deadline_days', 10)::int
  from public.jobs j
  where j.id = p_job_id and private.can_see_job(j.id)
$$;
revoke all on function public.planning_due(uuid) from public, anon;
grant execute on function public.planning_due(uuid) to authenticated;

-- A new team has no slot, so a submitted schedule is no longer complete.
create or replace function private.reopen_schedule_on_team()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.schedules set status = 'started', submitted_at = null, submitted_by = null
  where job_id = new.job_id and status in ('submitted', 'complete');
  return null;
end;
$$;
revoke all on function private.reopen_schedule_on_team() from public;
create trigger teams_reopen_schedule after insert on public.teams
  for each row execute function private.reopen_schedule_on_team();
