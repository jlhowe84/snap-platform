-- =============================================================================
-- Wave A, season board (module 1) and holds (module 2).
--
-- build_season_board(season): one offer per returning league (a league with a
--   live job in the same season last year), ranked by size so the biggest
--   leagues get first pick of dates. The top share of the ranking is the top
--   tier (longer hold). Re-running adds new leagues and re-ranks offers not
--   yet made; it never touches an offer already in progress.
-- hold_date(offer, date, stations): creates the held job and its photo day
--   from last season's job, places the hold for the tier's window, and checks
--   capacity in photo stations per date.
-- extend_hold / release_hold: owner or admin extend; the office releases.
-- =============================================================================

create or replace function private.setting_number(p_company uuid, p_key text, p_default numeric)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select case when jsonb_typeof(value) = 'number' then (value #>> '{}')::numeric end
     from public.settings where company_id = p_company and key = p_key),
    p_default)
$$;
revoke all on function private.setting_number(uuid, text, numeric) from public;

create or replace function public.build_season_board(p_season text)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_company  uuid := private.current_company_id();
  v_last     text;
  v_share    numeric;
  v_added    int;
begin
  if not private.can_edit_ops() then
    raise exception 'only the office can build the season board';
  end if;
  if p_season !~ '^(Winter|Spring|Summer|Fall) [0-9]{4}$' then
    raise exception 'season must read like Spring 2027';
  end if;
  v_last := split_part(p_season, ' ', 1) || ' ' || (split_part(p_season, ' ', 2)::int - 1);
  v_share := least(greatest(private.setting_number(v_company, 'season.top_tier_share', 0.25), 0), 1);

  -- Last season's job per league: the latest live one in that season.
  insert into public.season_offers (company_id, org_id, season, last_job_id, priority_basis)
  select v_company, l.org_id, p_season, l.job_id,
         jsonb_build_object('subjects', l.expected_subjects, 'teams', l.expected_teams,
                            'last_date', l.first_date, 'from_season', v_last)
  from (
    select distinct on (j.org_id)
           j.org_id, j.id as job_id, j.expected_subjects, j.expected_teams, f.first_date
    from public.jobs j
    join lateral (select min(pd.date) as first_date from public.photo_days pd where pd.job_id = j.id) f on true
    where j.company_id = v_company and j.org_id is not null
      and j.status not in ('cancelled', 'released', 'held')
      and public.season_label(f.first_date) = v_last
    order by j.org_id, f.first_date desc
  ) l
  on conflict (company_id, org_id, season) do nothing;
  get diagnostics v_added = row_count;

  -- Rank every offer not yet made: biggest first (subjects, then teams).
  -- Sales per player joins the ranking once Captura orders sync (Wave B).
  with ranked as (
    select o.id,
           row_number() over (order by (o.priority_basis ->> 'subjects')::int desc nulls last,
                                       (o.priority_basis ->> 'teams')::int desc nulls last,
                                       o.created_at) as rnk,
           count(*) over () as n
    from public.season_offers o
    where o.company_id = v_company and o.season = p_season
  )
  update public.season_offers o
  set priority_rank = r.rnk,
      tier = case when r.rnk <= ceil(r.n * v_share) then 'top' else 'other' end
  from ranked r
  where o.id = r.id and o.stage = 'not_offered';

  return v_added;
end;
$$;
revoke all on function public.build_season_board(text) from public, anon;
grant execute on function public.build_season_board(text) to authenticated;

create or replace function public.hold_date(
  p_offer_id uuid,
  p_date     date,
  p_stations smallint default 2,
  p_override boolean default false
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_company  uuid := private.current_company_id();
  v_offer    public.season_offers%rowtype;
  v_last     public.jobs%rowtype;
  v_last_day public.photo_days%rowtype;
  v_org      text;
  v_capacity int;
  v_used     int;
  v_days     int;
  v_job      uuid;
  v_day      uuid;
begin
  if not private.can_edit_ops() then
    raise exception 'only the office can hold a date';
  end if;
  select * into v_offer from public.season_offers where id = p_offer_id and company_id = v_company;
  if not found then
    raise exception 'offer not found';
  end if;
  if v_offer.stage in ('held', 'confirmed') then
    raise exception 'this league already has a date held or confirmed for %', v_offer.season;
  end if;
  if public.season_label(p_date) <> v_offer.season then
    raise exception '% is not in %', p_date, v_offer.season;
  end if;
  if p_stations not between 1 and 20 then
    raise exception 'stations must be between 1 and 20';
  end if;

  v_capacity := private.setting_number(v_company, 'capacity.stations_per_date', 10)::int;
  select coalesce(sum(pd.stations), 0) into v_used
  from public.photo_days pd join public.jobs j on j.id = pd.job_id
  where pd.company_id = v_company and pd.date = p_date and j.status not in ('released', 'cancelled');
  if v_used + p_stations > v_capacity and not (p_override and private.is_owner_or_admin()) then
    raise exception '% is full: % of % stations taken', p_date, v_used, v_capacity;
  end if;

  select name into v_org from public.organizations where id = v_offer.org_id;
  select * into v_last from public.jobs where id = v_offer.last_job_id;
  select * into v_last_day from public.photo_days where job_id = v_offer.last_job_id order by date limit 1;

  insert into public.jobs (company_id, org_id, name, status, sports, expected_teams, expected_subjects,
                           delivery_method, team_photo_type, sponsors, sale_mode, venue, program)
  values (v_company, v_offer.org_id, v_org || ' ' || v_offer.season, 'held',
          coalesce(v_last.sports, '{}'), v_last.expected_teams, v_last.expected_subjects,
          v_last.delivery_method, v_last.team_photo_type, v_last.sponsors,
          coalesce(v_last.sale_mode, 'prepay'), coalesce(v_last.venue, 'on_location'), coalesce(v_last.program, 'sports'))
  returning id into v_job;

  insert into public.photo_days (company_id, job_id, date, stations, start_time, end_time,
                                 location_name, address, city, state, indoor, alt_indoor_location)
  values (v_company, v_job, p_date, p_stations, v_last_day.start_time, v_last_day.end_time,
          v_last_day.location_name, v_last_day.address, v_last_day.city, v_last_day.state,
          v_last_day.indoor, v_last_day.alt_indoor_location)
  returning id into v_day;

  -- Last season's coordinators carry over, or the league's primary contact.
  insert into public.job_contacts (job_id, contact_id, company_id, role)
  select v_job, jc.contact_id, v_company, jc.role from public.job_contacts jc where jc.job_id = v_offer.last_job_id;
  if not found then
    insert into public.job_contacts (job_id, contact_id, company_id, role)
    select v_job, oc.contact_id, v_company, 'coordinator'
    from public.organization_contacts oc
    where oc.org_id = v_offer.org_id and oc.ended_on is null
    order by oc.is_primary desc
    limit 1;
  end if;

  v_days := case when v_offer.tier = 'top'
                 then private.setting_number(v_company, 'holds.days_top_tier', 21)
                 else private.setting_number(v_company, 'holds.days_other', 14) end;
  insert into public.date_holds (company_id, job_id, photo_day_id, offer_id, expires_on)
  values (v_company, v_job, v_day, v_offer.id, current_date + v_days);

  update public.season_offers
  set stage = 'held', offered_at = coalesce(offered_at, now())
  where id = v_offer.id;

  insert into public.touchpoints (company_id, org_id, job_id, offer_id, channel, direction, summary, actor_id, actor_kind)
  values (v_company, v_offer.org_id, v_job, v_offer.id, 'note', 'internal',
          format('Held %s (%s stations) until %s', to_char(p_date, 'Dy Mon DD, YYYY'), p_stations,
                 to_char(current_date + v_days, 'Mon DD')),
          auth.uid(), 'person');
  return v_job;
end;
$$;
revoke all on function public.hold_date(uuid, date, smallint, boolean) from public, anon;
grant execute on function public.hold_date(uuid, date, smallint, boolean) to authenticated;

create or replace function public.extend_hold(p_hold_id uuid, p_days int default 7)
returns date
language plpgsql security definer set search_path = '' as $$
declare
  v_hold public.date_holds%rowtype;
  v_new  date;
begin
  if not private.is_owner_or_admin() then
    raise exception 'only an owner or admin can extend a hold';
  end if;
  if p_days not between 1 and 60 then
    raise exception 'extend by 1 to 60 days';
  end if;
  select * into v_hold from public.date_holds
  where id = p_hold_id and company_id = private.current_company_id() and status = 'held';
  if not found then
    raise exception 'no open hold to extend';
  end if;
  v_new := greatest(v_hold.expires_on, current_date) + p_days;
  update public.date_holds
  set expires_on = v_new, extended_by = auth.uid(), reminder_sent_at = null
  where id = p_hold_id;
  insert into public.touchpoints (company_id, job_id, offer_id, org_id, channel, direction, summary, actor_id, actor_kind)
  select v_hold.company_id, v_hold.job_id, v_hold.offer_id, j.org_id, 'note', 'internal',
         format('Hold extended to %s', to_char(v_new, 'Mon DD')), auth.uid(), 'person'
  from public.jobs j where j.id = v_hold.job_id;
  return v_new;
end;
$$;
revoke all on function public.extend_hold(uuid, int) from public, anon;
grant execute on function public.extend_hold(uuid, int) to authenticated;

create or replace function public.release_hold(p_hold_id uuid, p_reason text default null, p_offer_stage public.offer_stage default 'offered')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_hold public.date_holds%rowtype;
begin
  -- auth.uid() is null for the server's nightly release of lapsed holds.
  if auth.uid() is not null and not private.can_edit_ops() then
    raise exception 'only the office can release a hold';
  end if;
  if p_offer_stage not in ('offered', 'declined', 'no_reply') then
    raise exception 'a released offer goes back to offered, declined or no reply';
  end if;
  select * into v_hold from public.date_holds
  where id = p_hold_id and status = 'held'
    and (auth.uid() is null or company_id = private.current_company_id());
  if not found then
    raise exception 'no open hold to release';
  end if;

  update public.date_holds
  set status = 'released', released_at = now(), released_reason = left(p_reason, 500)
  where id = p_hold_id;
  update public.jobs set status = 'released' where id = v_hold.job_id and status = 'held';
  update public.season_offers set stage = p_offer_stage, responded_at = coalesce(responded_at, now())
  where id = v_hold.offer_id and stage = 'held';
  insert into public.touchpoints (company_id, job_id, offer_id, org_id, channel, direction, summary, actor_id, actor_kind)
  select v_hold.company_id, v_hold.job_id, v_hold.offer_id, j.org_id, 'note', 'internal',
         'Hold released' || coalesce(': ' || nullif(btrim(p_reason), ''), ''),
         auth.uid(), case when auth.uid() is null then 'system' else 'person' end
  from public.jobs j where j.id = v_hold.job_id;
end;
$$;
revoke all on function public.release_hold(uuid, text, public.offer_stage) from public, anon;
grant execute on function public.release_hold(uuid, text, public.offer_stage) to authenticated, service_role;
