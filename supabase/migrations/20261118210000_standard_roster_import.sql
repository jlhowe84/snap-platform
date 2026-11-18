-- Rosters are normalized outside the platform (the office's own roster
-- process) and the finished SNAP roster CSV is uploaded on the job. The app
-- checks the file against the format, then calls import_standard_roster()
-- with the team facts it read. No child's name is stored in a table; the file
-- itself stays in the private rosters bucket for the Captura upload step.

-- The Group value from the roster: the label parents pick in the prepay
-- store, and the key a later import matches a team on.
alter table public.teams add column roster_group text;
create unique index teams_roster_group_key on public.teams (job_id, roster_group) where roster_group is not null;

alter table public.roster_versions
  add constraint roster_versions_csv_scope
  check (csv_path is null or (csv_path like company_id::text || '/' || job_id::text || '/%' and csv_path !~ '\.\.'));

create or replace function public.import_standard_roster(
  p_job_id uuid, p_csv_path text, p_teams jsonb, p_subject_count int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_job      public.jobs;
  v_id       uuid;
  v_version  int;
  v_added    int := 0;
  v_updated  int := 0;
  v_removed  int := 0;
  v_kept     int := 0;
  v_groups   text[] := '{}';
  t          record;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if v_job.id is null or v_job.company_id <> private.current_company_id() or not private.can_edit_ops() then
    raise exception 'not allowed to import a roster for this job';
  end if;
  if p_csv_path is null or p_csv_path ~ '\.\.'
     or p_csv_path not like v_job.company_id::text || '/' || p_job_id::text || '/%' then
    raise exception 'that file does not belong to this job';
  end if;
  if p_teams is null or jsonb_typeof(p_teams) <> 'array' or p_subject_count is null or p_subject_count < 0 then
    raise exception 'roster import needs a list of teams and a head count';
  end if;

  for t in
    select * from jsonb_to_recordset(p_teams)
      as x("group" text, name text, division text, coach text, sponsor text, players int)
  loop
    if coalesce(btrim(t."group"), '') = '' or coalesce(btrim(t.name), '') = ''
       or t.players is null or t.players < 0 or t."group" = any (v_groups) then
      raise exception 'roster import has a team row that cannot be used';
    end if;
    v_groups := v_groups || t."group";

    -- The same team from an earlier import, or one typed in by hand under
    -- the same name and division.
    select id into v_id from public.teams where job_id = p_job_id and roster_group = t."group";
    if v_id is null then
      select id into v_id from public.teams
      where job_id = p_job_id and roster_group is null and name = t.name
        and division is not distinct from nullif(btrim(t.division), '')
      limit 1;
    end if;

    if v_id is null then
      insert into public.teams (company_id, job_id, name, division, coach_name, sponsor, player_count, roster_group, source)
      values (v_job.company_id, p_job_id, t.name, nullif(btrim(t.division), ''), nullif(btrim(t.coach), ''),
              nullif(btrim(t.sponsor), ''), t.players, t."group", 'roster');
      v_added := v_added + 1;
    else
      update public.teams set
        name = t.name,
        division = nullif(btrim(t.division), ''),
        coach_name = coalesce(nullif(btrim(t.coach), ''), coach_name),
        sponsor = coalesce(nullif(btrim(t.sponsor), ''), sponsor),
        player_count = t.players,
        roster_group = t."group"
      where id = v_id;
      v_updated := v_updated + 1;
    end if;
  end loop;

  -- Teams an earlier roster brought in that this one no longer has: gone,
  -- unless they already hold a time on a schedule (a person decides those).
  select count(*) into v_kept
  from public.teams tm
  where tm.job_id = p_job_id and tm.source = 'roster'
    and (tm.roster_group is null or tm.roster_group <> all (v_groups))
    and exists (select 1 from public.schedule_slots s where s.team_id = tm.id);

  delete from public.teams tm
  where tm.job_id = p_job_id and tm.source = 'roster'
    and (tm.roster_group is null or tm.roster_group <> all (v_groups))
    and not exists (select 1 from public.schedule_slots s where s.team_id = tm.id);
  get diagnostics v_removed = row_count;

  update public.roster_versions set status = 'superseded'
  where job_id = p_job_id and status in ('processing', 'needs_answers', 'ready');
  select coalesce(max(version), 0) + 1 into v_version from public.roster_versions where job_id = p_job_id;
  insert into public.roster_versions (company_id, job_id, version, status, csv_path, subject_count, team_count)
  values (v_job.company_id, p_job_id, v_version, 'ready', p_csv_path, p_subject_count, coalesce(array_length(v_groups, 1), 0));

  return jsonb_build_object('version', v_version, 'added', v_added, 'updated', v_updated,
                            'removed', v_removed, 'kept', v_kept);
end;
$$;
revoke all on function public.import_standard_roster(uuid, text, jsonb, int) from public, anon;
grant execute on function public.import_standard_roster(uuid, text, jsonb, int) to authenticated;
