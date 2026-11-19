-- =============================================================================
-- Wave B, module 7 (staffing, part one): shifts per photo day, offers that open
-- in waves by Level, crew accepting or declining on their phone, and pay rates.
-- Pay lines, payroll reports and crew notices (email and text) follow.
--
-- Level 1 is asked first. A shift's open_level is the highest Level that can
-- see it now; null means everyone (including crew with no Level).
-- =============================================================================

create type public.shift_status as enum ('draft', 'open', 'filled', 'cancelled');

create table public.shifts (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  job_id          uuid not null references public.jobs(id) on delete cascade,
  photo_day_id    uuid not null references public.photo_days(id) on delete cascade,
  position        text not null
                  check (position in ('photographer', 'poser', 'coordinator', 'photo_attendant')),
  station         smallint check (station between 1 and 20),
  start_time      time,
  end_time        time,
  status          public.shift_status not null default 'draft',
  crew_member_id  uuid references public.crew_members(id) on delete set null,
  open_level      smallint check (open_level between 1 and 5),
  published_at    timestamptz,
  filled_at       timestamptz,
  filled_by       text check (filled_by in ('crew', 'office')),
  notes           text check (char_length(notes) <= 1000),
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((status = 'filled') = (crew_member_id is not null)),
  check (start_time is null or end_time is null or end_time > start_time)
);
create index shifts_photo_day_idx on public.shifts (photo_day_id, position, station);
create index shifts_company_status_idx on public.shifts (company_id, status);
create index shifts_crew_idx on public.shifts (crew_member_id) where crew_member_id is not null;
create index shifts_job_idx on public.shifts (job_id);
create index shifts_created_by_idx on public.shifts (created_by);
-- One shift per person per photo day.
create unique index shifts_one_per_day_idx on public.shifts (photo_day_id, crew_member_id)
  where crew_member_id is not null;

-- A crew member's answer to an offer. Accepting fills the shift; declining
-- hides it from them. Written only by respond_to_shift().
create table public.shift_responses (
  shift_id        uuid not null references public.shifts(id) on delete cascade,
  crew_member_id  uuid not null references public.crew_members(id) on delete cascade,
  company_id      uuid not null references public.companies(id) on delete cascade,
  response        text not null check (response in ('accepted', 'declined')),
  responded_at    timestamptz not null default now(),
  primary key (shift_id, crew_member_id)
);
create index shift_responses_crew_idx on public.shift_responses (crew_member_id);
create index shift_responses_company_idx on public.shift_responses (company_id);

-- What each person is paid for a position. Owner and admin only (spec: pay
-- rates and payroll); a crew member reads their own.
create table public.pay_rates (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  crew_member_id  uuid not null references public.crew_members(id) on delete cascade,
  position        text not null
                  check (position in ('photographer', 'poser', 'coordinator', 'photo_attendant', 'office')),
  amount          numeric(8,2) not null check (amount >= 0),
  unit            text not null default 'shift' check (unit in ('shift', 'hour')),
  notes           text check (char_length(notes) <= 500),
  updated_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (crew_member_id, position)
);
create index pay_rates_company_idx on public.pay_rates (company_id);
create index pay_rates_updated_by_idx on public.pay_rates (updated_by);

-- ---------------------------------------------------------------------------
-- Keep a shift's company and job in step with its photo day.
-- ---------------------------------------------------------------------------
create or replace function private.shift_fill_from_day()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_day public.photo_days%rowtype;
begin
  select * into v_day from public.photo_days where id = new.photo_day_id;
  if v_day.id is null then
    raise exception 'photo day not found';
  end if;
  new.company_id := v_day.company_id;
  new.job_id := v_day.job_id;
  if tg_op = 'UPDATE' and new.photo_day_id <> old.photo_day_id then
    raise exception 'a shift cannot move to another photo day';
  end if;
  if new.crew_member_id is not null and not exists (
    select 1 from public.crew_members c where c.id = new.crew_member_id and c.company_id = new.company_id
  ) then
    raise exception 'crew member not found';
  end if;
  if new.status = 'filled' and (tg_op = 'INSERT' or old.crew_member_id is distinct from new.crew_member_id) then
    new.filled_at := now();
  end if;
  if new.status <> 'filled' then
    new.filled_at := null;
    new.filled_by := null;
  end if;
  if new.status = 'open' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;
revoke all on function private.shift_fill_from_day() from public;

create trigger shifts_fill_from_day before insert or update on public.shifts
  for each row execute function private.shift_fill_from_day();

create or replace function private.pay_rate_stamp()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select c.company_id into new.company_id from public.crew_members c where c.id = new.crew_member_id;
  if new.company_id is null then
    raise exception 'crew member not found';
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;
revoke all on function private.pay_rate_stamp() from public;

create trigger pay_rates_stamp before insert or update on public.pay_rates
  for each row execute function private.pay_rate_stamp();

create trigger shifts_updated_at before update on public.shifts
  for each row execute function private.set_updated_at();
create trigger pay_rates_updated_at before update on public.pay_rates
  for each row execute function private.set_updated_at();
create trigger shifts_log after insert or update or delete on public.shifts
  for each row execute function private.log_row_change();
-- No activity log on pay_rates: the log is readable by all staff and pay is
-- owner and admin only. shift_responses is itself the record of answers.

-- ---------------------------------------------------------------------------
-- The signed-in person's crew record, when they hold the crew role.
-- ---------------------------------------------------------------------------
create or replace function private.my_crew_member_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select c.id from public.crew_members c
  where c.profile_id = auth.uid()
    and c.active
    and c.company_id = private.current_company_id()
    and private.has_role('crew')
  limit 1
$$;
revoke all on function private.my_crew_member_id() from public;
grant execute on function private.my_crew_member_id() to authenticated, service_role;

-- When someone is given the crew role, link them to the crew record with the
-- same email, so their shifts and pay find them.
create or replace function private.link_crew_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'crew' then
    update public.crew_members c
       set profile_id = new.profile_id
      from public.profiles p
     where p.id = new.profile_id
       and c.company_id = new.company_id
       and c.profile_id is null
       and c.email is not null
       and lower(c.email) = lower(p.email)
       and not exists (select 1 from public.crew_members x where x.profile_id = new.profile_id);
  end if;
  return null;
end;
$$;
revoke all on function private.link_crew_profile() from public;

create trigger profile_roles_link_crew after insert on public.profile_roles
  for each row execute function private.link_crew_profile();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.shifts enable row level security;
alter table public.shift_responses enable row level security;
alter table public.pay_rates enable row level security;

grant select, insert, update, delete on public.shifts to authenticated;
grant select on public.shift_responses to authenticated;
grant select, insert, update, delete on public.pay_rates to authenticated;
grant all on public.shifts, public.shift_responses, public.pay_rates to service_role;

-- shifts: staff read every shift; owner, admin and office publish and assign.
-- Crew read only their own filled shifts here; open offers reach them through
-- crew_shift_board(), which also carries the photo day details they need.
create policy shifts_select on public.shifts for select to authenticated
  using ((company_id = (select private.current_company_id()) and (select private.is_staff()))
         or (crew_member_id is not null and crew_member_id = (select private.my_crew_member_id())));
create policy shifts_insert on public.shifts for insert to authenticated
  with check (company_id = (select private.current_company_id()) and (select private.can_edit_ops()));
create policy shifts_update on public.shifts for update to authenticated
  using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()))
  with check (company_id = (select private.current_company_id()));
create policy shifts_delete on public.shifts for delete to authenticated
  using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()));

create policy shift_responses_select on public.shift_responses for select to authenticated
  using ((company_id = (select private.current_company_id()) and (select private.is_staff()))
         or crew_member_id = (select private.my_crew_member_id()));

create policy pay_rates_select on public.pay_rates for select to authenticated
  using ((company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()))
         or crew_member_id = (select private.my_crew_member_id()));
create policy pay_rates_insert on public.pay_rates for insert to authenticated
  with check (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));
create policy pay_rates_update on public.pay_rates for update to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()))
  with check (company_id = (select private.current_company_id()));
create policy pay_rates_delete on public.pay_rates for delete to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));

-- ---------------------------------------------------------------------------
-- The crew phone page: my shifts and the offers open to me.
-- ---------------------------------------------------------------------------
create or replace function private.shift_offered_to(p_shift public.shifts, p_crew public.crew_members)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_shift.status = 'open'
     and p_shift.company_id = p_crew.company_id
     and p_crew.active
     and p_shift.position = any (p_crew.positions)
     and (p_shift.open_level is null or (p_crew.level is not null and p_crew.level <= p_shift.open_level))
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
      and ((s.crew_member_id = v_crew.id and s.status = 'filled')
           or private.shift_offered_to(s, v_crew))
    order by d.date, s.start_time nulls last, s.position;
end;
$$;
revoke all on function public.crew_shift_board() from public, anon;
grant execute on function public.crew_shift_board() to authenticated;

-- Accept or decline an offer. Accepting is first come, first served: the row
-- is locked, so two people cannot take the same shift.
create or replace function public.respond_to_shift(p_shift_id uuid, p_accept boolean)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_crew public.crew_members%rowtype;
  v_shift public.shifts%rowtype;
  v_date date;
begin
  select * into v_crew from public.crew_members where id = private.my_crew_member_id();
  if v_crew.id is null then
    raise exception 'only crew can answer a shift';
  end if;
  select * into v_shift from public.shifts where id = p_shift_id for update;
  if v_shift.id is null or v_shift.company_id <> v_crew.company_id then
    raise exception 'shift not found';
  end if;
  if not private.shift_offered_to(v_shift, v_crew) then
    if v_shift.crew_member_id = v_crew.id then
      return 'already_yours';
    end if;
    return 'no_longer_open';
  end if;

  if not p_accept then
    insert into public.shift_responses (shift_id, crew_member_id, company_id, response)
    values (v_shift.id, v_crew.id, v_crew.company_id, 'declined')
    on conflict (shift_id, crew_member_id) do update set response = 'declined', responded_at = now();
    return 'declined';
  end if;

  -- Refuse a shift that overlaps one they already hold that day.
  select date into v_date from public.photo_days where id = v_shift.photo_day_id;
  if exists (
    select 1 from public.shifts s
    join public.photo_days d on d.id = s.photo_day_id
    where s.crew_member_id = v_crew.id and s.status = 'filled' and d.date = v_date
      and (s.start_time is null or s.end_time is null or v_shift.start_time is null or v_shift.end_time is null
           or (s.start_time < v_shift.end_time and v_shift.start_time < s.end_time))
  ) then
    return 'conflict';
  end if;

  update public.shifts
     set status = 'filled', crew_member_id = v_crew.id, filled_by = 'crew'
   where id = v_shift.id;
  insert into public.shift_responses (shift_id, crew_member_id, company_id, response)
  values (v_shift.id, v_crew.id, v_crew.company_id, 'accepted')
  on conflict (shift_id, crew_member_id) do update set response = 'accepted', responded_at = now();
  return 'accepted';
end;
$$;
revoke all on function public.respond_to_shift(uuid, boolean) from public, anon;
grant execute on function public.respond_to_shift(uuid, boolean) to authenticated;
