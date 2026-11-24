-- =============================================================================
-- Rosters: what changed since the last finished roster.
--
-- A league often sends a corrected roster after the first one is processed.
-- When the office uploads the new finished CSV, the import now records the
-- differences against the roster before it on the new version's `diff`:
-- teams added, teams gone (and whether one was kept because it holds a time
-- on a schedule), teams whose head count moved, and the totals. Team names
-- and counts only. Everything else about the import is unchanged.
-- =============================================================================

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
  v_before   jsonb;
  v_prev     public.roster_versions;
  v_diff     jsonb;
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

  -- What the last finished roster left on the job, to compare against after.
  select * into v_prev from public.roster_versions
   where job_id = p_job_id and csv_path is not null and status in ('ready', 'uploaded', 'superseded')
   order by version desc limit 1;
  select coalesce(jsonb_object_agg(tm.roster_group, jsonb_build_object('name', tm.name, 'division', tm.division, 'players', tm.player_count)), '{}'::jsonb)
    into v_before
    from public.teams tm where tm.job_id = p_job_id and tm.roster_group is not null;

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

  -- Differences against the roster before this one, by team. Team names and
  -- head counts only; no child's name is stored.
  if v_prev.id is not null then
    select jsonb_build_object(
      'from_version', v_prev.version,
      'players', jsonb_build_object('from', v_prev.subject_count, 'to', p_subject_count),
      'teams', jsonb_build_object('from', v_prev.team_count, 'to', coalesce(array_length(v_groups, 1), 0)),
      'added', coalesce((select jsonb_agg(jsonb_build_object('name', x.name, 'division', nullif(btrim(x.division), ''), 'players', x.players) order by x.name)
                           from jsonb_to_recordset(p_teams) as x("group" text, name text, division text, players int)
                          where not v_before ? x."group"), '[]'::jsonb),
      'removed', coalesce((select jsonb_agg(jsonb_build_object('name', b.value ->> 'name', 'division', b.value ->> 'division',
                                                              'players', (b.value ->> 'players')::int,
                                                              'kept', exists (select 1 from public.teams tm where tm.job_id = p_job_id and tm.roster_group = b.key))
                                            order by b.value ->> 'name')
                             from jsonb_each(v_before) b where b.key <> all (v_groups)), '[]'::jsonb),
      'changed', coalesce((select jsonb_agg(jsonb_build_object('name', x.name, 'division', nullif(btrim(x.division), ''),
                                                              'from', (v_before -> x."group" ->> 'players')::int, 'to', x.players) order by x.name)
                             from jsonb_to_recordset(p_teams) as x("group" text, name text, division text, players int)
                            where v_before ? x."group" and (v_before -> x."group" ->> 'players')::int is distinct from x.players), '[]'::jsonb)
    ) into v_diff;
  end if;

  update public.roster_versions set status = 'superseded'
  where job_id = p_job_id and status in ('processing', 'needs_answers', 'ready');
  select coalesce(max(version), 0) + 1 into v_version from public.roster_versions where job_id = p_job_id;
  insert into public.roster_versions (company_id, job_id, version, status, csv_path, subject_count, team_count, diff)
  values (v_job.company_id, p_job_id, v_version, 'ready', p_csv_path, p_subject_count, coalesce(array_length(v_groups, 1), 0), v_diff);

  return jsonb_build_object('version', v_version, 'added', v_added, 'updated', v_updated,
                            'removed', v_removed, 'kept', v_kept);
end;
$$;
revoke all on function public.import_standard_roster(uuid, text, jsonb, int) from public, anon;
grant execute on function public.import_standard_roster(uuid, text, jsonb, int) to authenticated;
