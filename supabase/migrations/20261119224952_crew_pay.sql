-- =============================================================================
-- Wave B, module 7 (staffing, part two): pay per shift with mileage, ready for
-- the payroll report. Owner and admin only; a crew member reads their own.
-- Payroll itself is still run where it runs today, from the report.
-- =============================================================================

-- Mileage is paid at a company rate (cents per mile, 0 until Josh sets it);
-- the payroll report starts from the last pay period's length.
insert into public.settings (company_id, key, value)
select c.id, s.key, s.value
from public.companies c
cross join (values ('pay.mileage_cents_per_mile', '0'::jsonb), ('pay.period_days', '14'::jsonb)) as s(key, value)
on conflict (company_id, key) do nothing;

create table public.pay_lines (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  crew_member_id  uuid not null references public.crew_members(id) on delete cascade,
  shift_id        uuid unique references public.shifts(id) on delete set null,
  work_date       date not null,
  position        text,
  description     text check (char_length(description) <= 300),
  rate            numeric(8,2),
  unit            text check (unit in ('shift', 'hour')),
  hours           numeric(5,2) check (hours >= 0),
  base            numeric(9,2) not null default 0,
  miles           numeric(6,1) not null default 0 check (miles >= 0),
  mileage         numeric(9,2) not null default 0,
  adjustment      numeric(9,2) not null default 0,
  note            text check (char_length(note) <= 500),
  total           numeric(9,2) generated always as (base + mileage + adjustment) stored,
  status          text not null default 'pending' check (status in ('pending', 'approved', 'paid')),
  approved_by     uuid references public.profiles(id) on delete set null,
  approved_at     timestamptz,
  paid_at         timestamptz,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index pay_lines_company_date_idx on public.pay_lines (company_id, work_date);
create index pay_lines_crew_idx on public.pay_lines (crew_member_id, work_date);
create index pay_lines_approved_by_idx on public.pay_lines (approved_by);
create index pay_lines_created_by_idx on public.pay_lines (created_by);

-- Company from the crew member; mileage from the company rate whenever the
-- miles change; who approved and when.
create or replace function private.pay_line_stamp()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_cents numeric;
begin
  select c.company_id into new.company_id from public.crew_members c where c.id = new.crew_member_id;
  if new.company_id is null then
    raise exception 'crew member not found';
  end if;
  if tg_op = 'INSERT' or new.miles is distinct from old.miles then
    select coalesce((s.value #>> '{}')::numeric, 0) into v_cents
    from public.settings s where s.company_id = new.company_id and s.key = 'pay.mileage_cents_per_mile';
    new.mileage := round(new.miles * coalesce(v_cents, 0) / 100, 2);
  end if;
  if new.status in ('approved', 'paid') and (tg_op = 'INSERT' or old.status = 'pending') then
    new.approved_by := auth.uid();
    new.approved_at := now();
  elsif new.status = 'pending' then
    new.approved_by := null;
    new.approved_at := null;
  end if;
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status <> 'paid') then
    new.paid_at := now();
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;
revoke all on function private.pay_line_stamp() from public;

create trigger pay_lines_stamp before insert or update on public.pay_lines
  for each row execute function private.pay_line_stamp();
create trigger pay_lines_updated_at before update on public.pay_lines
  for each row execute function private.set_updated_at();
-- No activity log: pay is owner and admin only and the log is read by all staff.

alter table public.pay_lines enable row level security;
grant select, insert, update, delete on public.pay_lines to authenticated;
grant all on public.pay_lines to service_role;

create policy pay_lines_select on public.pay_lines for select to authenticated
  using ((company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()))
         or crew_member_id = (select private.my_crew_member_id()));
create policy pay_lines_insert on public.pay_lines for insert to authenticated
  with check (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));
-- A paid line is final.
create policy pay_lines_update on public.pay_lines for update to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()) and status <> 'paid')
  with check (company_id = (select private.current_company_id()));
create policy pay_lines_delete on public.pay_lines for delete to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()) and status = 'pending');

-- One pending line for every filled shift in the range that has none, priced
-- from the person's rate for that position. Runs as the caller, so only the
-- owner and admins can use it. Returns how many lines were added.
create or replace function public.create_pay_lines(p_from date, p_to date)
returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_count integer;
begin
  if not private.is_owner_or_admin() then
    raise exception 'only the owner and admins can add pay';
  end if;
  insert into public.pay_lines (company_id, crew_member_id, shift_id, work_date, position, description, rate, unit, hours, base, note)
  select s.company_id, s.crew_member_id, s.id, d.date, s.position, j.name, r.amount, r.unit,
         case when r.unit = 'hour' and s.start_time is not null and s.end_time is not null
              then round((extract(epoch from (s.end_time - s.start_time)) / 3600)::numeric, 2) end,
         case when r.unit = 'shift' then r.amount
              when r.unit = 'hour' and s.start_time is not null and s.end_time is not null
              then round(r.amount * (extract(epoch from (s.end_time - s.start_time)) / 3600)::numeric, 2)
              else 0 end,
         case when r.id is null then 'No pay rate for this position yet.'
              when r.unit = 'hour' and (s.start_time is null or s.end_time is null) then 'Hourly rate but the shift has no times: enter the hours.' end
  from public.shifts s
  join public.photo_days d on d.id = s.photo_day_id
  join public.jobs j on j.id = s.job_id
  left join public.pay_rates r on r.crew_member_id = s.crew_member_id and r.position = s.position
  where s.company_id = private.current_company_id()
    and s.status = 'filled'
    and d.status = 'scheduled'
    and d.date between p_from and p_to
    and not exists (select 1 from public.pay_lines p where p.shift_id = s.id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.create_pay_lines(date, date) from public, anon;
grant execute on function public.create_pay_lines(date, date) to authenticated;
