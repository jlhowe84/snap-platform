-- Crew pay follow-ups (owner's answers, 2026-11-19):
--   * Crew are paid by the hour, so a new pay rate defaults to hourly.
--   * Mileage is paid from the person's home to the photo day. Home addresses
--     are private: owner and admin only, and no activity log row (the log is
--     readable by all staff). The pay page links directions from home to the
--     day so the miles can be read off; working them out automatically needs
--     a maps service and comes later.

alter table public.pay_rates alter column unit set default 'hour';

create table public.crew_homes (
  crew_member_id  uuid primary key references public.crew_members(id) on delete cascade,
  company_id      uuid not null references public.companies(id) on delete cascade,
  address         text not null check (length(trim(address)) between 5 and 300),
  updated_at      timestamptz not null default now()
);
create index crew_homes_company_idx on public.crew_homes (company_id);

create or replace function private.crew_home_check()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.crew_members c where c.id = new.crew_member_id and c.company_id = new.company_id) then
    raise exception 'crew member is not in this company';
  end if;
  return new;
end;
$$;
revoke all on function private.crew_home_check() from public;
create trigger crew_homes_check before insert or update on public.crew_homes
  for each row execute function private.crew_home_check();
create trigger crew_homes_updated_at before update on public.crew_homes
  for each row execute function private.set_updated_at();

alter table public.crew_homes enable row level security;
grant select, insert, update, delete on public.crew_homes to authenticated;
grant all on public.crew_homes to service_role;
create policy crew_homes_all on public.crew_homes for all to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()))
  with check (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));
