-- Offers and the crew board only cover photo days that are still scheduled:
-- a postponed day has no date to work, and a cancelled one is off.
create or replace function private.shift_offered_to(p_shift public.shifts, p_crew public.crew_members)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_shift.status = 'open'
     and p_shift.company_id = p_crew.company_id
     and p_crew.active
     and p_shift.position = any (p_crew.positions)
     and (p_shift.open_level is null or (p_crew.level is not null and p_crew.level <= p_shift.open_level))
     and exists (select 1 from public.photo_days d where d.id = p_shift.photo_day_id and d.status = 'scheduled')
     and not exists (select 1 from public.shift_responses r
                     where r.shift_id = p_shift.id and r.crew_member_id = p_crew.id and r.response = 'declined')
     and not exists (select 1 from public.shifts s
                     where s.photo_day_id = p_shift.photo_day_id and s.crew_member_id = p_crew.id)
$$;
revoke all on function private.shift_offered_to(public.shifts, public.crew_members) from public;

create or replace function public.crew_shift_board()
returns table (
  shift_id       uuid,
  kind           text,
  "position"     text,
  station        smallint,
  start_time     time,
  end_time       time,
  notes          text,
  photo_day_id   uuid,
  date           date,
  location_name  text,
  address        text,
  city           text,
  state          text,
  indoor         boolean,
  job_name       text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_crew public.crew_members%rowtype;
  v_today date;
begin
  select * into v_crew from public.crew_members where id = private.my_crew_member_id();
  if v_crew.id is null then
    return;
  end if;
  select (now() at time zone c.time_zone)::date into v_today from public.companies c where c.id = v_crew.company_id;
  return query
    select s.id,
           case when s.crew_member_id = v_crew.id then 'mine' else 'offered' end,
           s.position, s.station, s.start_time, s.end_time, s.notes,
           d.id, d.date, d.location_name, d.address, d.city, d.state, d.indoor, j.name
    from public.shifts s
    join public.photo_days d on d.id = s.photo_day_id
    join public.jobs j on j.id = s.job_id
    where s.company_id = v_crew.company_id
      and d.date >= v_today
      and d.status = 'scheduled'
      and ((s.crew_member_id = v_crew.id and s.status = 'filled')
           or private.shift_offered_to(s, v_crew))
    order by d.date, s.start_time nulls last, s.position;
end;
$$;
revoke all on function public.crew_shift_board() from public, anon;
grant execute on function public.crew_shift_board() to authenticated;
