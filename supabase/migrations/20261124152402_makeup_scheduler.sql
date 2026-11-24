-- Makeup and retake scheduler (module 13).
--
-- A parent picks an open time on the public booking page; the office sees the
-- booking, prints a photo slip for it and ticks off the follow-up. Open days,
-- hours and blackout dates are one company setting (makeup.schedule). The
-- public page has no sign-in, so it is served by the server with the service
-- role after it has checked the slot; nobody outside staff reads this table.
create table public.makeup_bookings (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  date          date not null,
  start_time    time not null,
  minutes       smallint not null default 10 check (minutes between 5 and 120),
  seat          smallint not null default 1 check (seat between 1 and 20),
  kind          text not null default 'makeup' check (kind in ('makeup', 'retake')),
  status        text not null default 'booked' check (status in ('booked', 'cancelled', 'done', 'no_show')),
  source        text not null default 'parent' check (source in ('parent', 'staff')),
  player        text not null check (length(player) between 1 and 120),
  league        text check (league is null or length(league) <= 160),
  team          text check (team is null or length(team) <= 160),
  parent_name   text check (parent_name is null or length(parent_name) <= 120),
  email         text check (email is null or length(email) <= 254),
  phone         text check (phone is null or length(phone) <= 40),
  order_number  bigint check (order_number is null or order_number > 0),
  parent_note   text check (parent_note is null or length(parent_note) <= 1000),
  job_id        uuid references public.jobs(id) on delete set null,
  case_id       uuid references public.prepay_photo_cases(id) on delete set null,
  online_code   text check (online_code is null or online_code ~ '^[A-Za-z0-9-]{1,40}$'),
  staff_note    text check (staff_note is null or length(staff_note) <= 2000),
  imported      boolean not null default false,
  uploaded      boolean not null default false,
  added_to_team boolean not null default false,
  email_sent    boolean not null default false,
  lab_sent      boolean not null default false,
  token_hash    text unique,            -- the parent's own link; only the hash is kept
  cancelled_at  timestamptz,
  cancelled_by  text check (cancelled_by is null or cancelled_by in ('parent', 'staff')),
  reminded_on   date,                   -- the day the office was reminded
  created_by    uuid references public.profiles(id) on delete set null,
  updated_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- One booking per seat of a time. A cancelled booking frees its seat.
create unique index makeup_bookings_slot_idx on public.makeup_bookings (company_id, date, start_time, seat)
  where status <> 'cancelled';
create index makeup_bookings_day_idx on public.makeup_bookings (company_id, date);
create index makeup_bookings_job_idx on public.makeup_bookings (job_id);
create index makeup_bookings_case_idx on public.makeup_bookings (case_id);
create index makeup_bookings_created_by_idx on public.makeup_bookings (created_by);
create index makeup_bookings_updated_by_idx on public.makeup_bookings (updated_by);

create trigger makeup_bookings_updated_at before update on public.makeup_bookings
  for each row execute function private.set_updated_at();

-- Owner, admin and office work the bookings; support reads them to answer
-- parents. Crew and coordinators see nothing: the rows hold parent details.
alter table public.makeup_bookings enable row level security;
revoke all on public.makeup_bookings from anon, authenticated;
grant select, insert, update, delete on public.makeup_bookings to authenticated;
grant all on public.makeup_bookings to service_role;

create policy makeup_bookings_select on public.makeup_bookings for select to authenticated
  using (company_id = (select private.current_company_id())
         and ((select private.can_edit_ops()) or (select private.has_role('support'))));
create policy makeup_bookings_insert on public.makeup_bookings for insert to authenticated
  with check (company_id = (select private.current_company_id())
              and (select private.can_edit_ops())
              and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.company_id = makeup_bookings.company_id))
              and (case_id is null or exists (select 1 from public.prepay_photo_cases c where c.id = case_id and c.company_id = makeup_bookings.company_id)));
create policy makeup_bookings_update on public.makeup_bookings for update to authenticated
  using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()))
  with check (company_id = (select private.current_company_id())
              and (select private.can_edit_ops())
              and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.company_id = makeup_bookings.company_id))
              and (case_id is null or exists (select 1 from public.prepay_photo_cases c where c.id = case_id and c.company_id = makeup_bookings.company_id)));
create policy makeup_bookings_delete on public.makeup_bookings for delete to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));

-- Two more kinds of notice: a booking was made or cancelled, and bookings are
-- coming up today.
alter table public.notices drop constraint notices_kind_check;
alter table public.notices add constraint notices_kind_check
  check (kind in ('task.assigned', 'date.changed', 'queue.at_risk', 'makeup.booked', 'makeup.upcoming'));
alter table public.notice_mutes drop constraint notice_mutes_kind_check;
alter table public.notice_mutes add constraint notice_mutes_kind_check
  check (kind in ('task.assigned', 'date.changed', 'queue.at_risk', 'makeup.booked', 'makeup.upcoming'));

-- The office, admins and owners hear of each new booking and of each one
-- cancelled. The person who made the change is left out (private.notify).
create or replace function private.notice_makeup_booking()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_title text;
  r       record;
begin
  if tg_op = 'INSERT' and new.status = 'booked' then
    v_title := initcap(new.kind) || ' booked: ' || new.player;
  elsif tg_op = 'UPDATE' and new.status = 'cancelled' and old.status = 'booked' then
    v_title := initcap(new.kind) || ' cancelled: ' || new.player;
  else
    return new;
  end if;
  for r in
    select distinct pr.profile_id from public.profile_roles pr
    where pr.company_id = new.company_id and pr.role in ('owner', 'admin', 'office')
  loop
    perform private.notify(new.company_id, r.profile_id, 'makeup.booked', v_title,
      to_char(new.date, 'Dy Mon DD') || ' at ' || to_char(new.start_time, 'FMHH12:MI AM'),
      '/production/makeups?date=' || new.date);
  end loop;
  return new;
end;
$$;
revoke all on function private.notice_makeup_booking() from public;
create trigger makeup_bookings_notice after insert or update of status on public.makeup_bookings
  for each row execute function private.notice_makeup_booking();

-- The morning reminder, called by the daily job: one notice to each office
-- person when bookings are on today's list, once a day. Returns how many
-- bookings it covered.
create or replace function public.makeup_reminders(p_company uuid, p_today date)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
  v_first time;
  r       record;
begin
  select count(*), min(start_time) into v_count, v_first
  from public.makeup_bookings
  where company_id = p_company and date = p_today and status = 'booked' and reminded_on is null;
  if v_count = 0 then
    return 0;
  end if;
  for r in
    select distinct pr.profile_id from public.profile_roles pr
    where pr.company_id = p_company and pr.role in ('owner', 'admin', 'office')
  loop
    perform private.notify(p_company, r.profile_id, 'makeup.upcoming',
      v_count || case when v_count = 1 then ' makeup or retake today' else ' makeups and retakes today' end,
      'First at ' || to_char(v_first, 'FMHH12:MI AM'),
      '/production/makeups?date=' || p_today);
  end loop;
  update public.makeup_bookings set reminded_on = p_today
  where company_id = p_company and date = p_today and status = 'booked' and reminded_on is null;
  return v_count;
end;
$$;
revoke all on function public.makeup_reminders(uuid, date) from public, anon, authenticated;
grant execute on function public.makeup_reminders(uuid, date) to service_role;
