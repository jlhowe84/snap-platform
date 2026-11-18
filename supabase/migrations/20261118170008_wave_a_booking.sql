-- =============================================================================
-- Wave A, booking side (spec modules 1, 2, 3; data model groups Booking and
-- Changes): season offers, date holds, leads, touchpoints, agreement versions
-- and signatures, job variants and photo-day stations.
--
-- A held date is a job in status 'held' with its photo day, so the portal
-- stays one link per job from the first offer. Confirming (signing the
-- agreement) moves it to 'planning'; a hold that lapses moves it to 'released'.
-- =============================================================================

-- The 'held' and 'released' job states come from 20261118165931_job_status_held_released.

-- Job variants are settings, not special cases (module 3).
alter table public.jobs
  add column sale_mode text not null default 'prepay' check (sale_mode in ('prepay', 'proofing')),
  add column venue     text not null default 'on_location' check (venue in ('on_location', 'studio')),
  add column program   text not null default 'sports' check (program in ('sports', 'swim'));

-- Capacity is counted in photo stations per date (module 1).
alter table public.photo_days
  add column stations smallint not null default 2 check (stations between 1 and 20);

-- Who may act for a job in the portal: a coordinator linked to it.
create or replace function private.is_job_coordinator(p_job_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_role('coordinator')
     and exists (
       select 1 from public.job_coordinators c
       join public.jobs j on j.id = c.job_id
       where c.job_id = p_job_id and c.profile_id = auth.uid()
         and j.company_id = private.current_company_id()
     )
$$;
revoke all on function private.is_job_coordinator(uuid) from public;
grant execute on function private.is_job_coordinator(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Season board: one offer per league per season (module 1).
-- ---------------------------------------------------------------------------
create type public.offer_stage as enum ('not_offered', 'offered', 'held', 'confirmed', 'declined', 'no_reply');

create table public.season_offers (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  season          text not null check (season ~ '^(Winter|Spring|Summer|Fall) [0-9]{4}$'),
  stage           public.offer_stage not null default 'not_offered',
  tier            text not null default 'other' check (tier in ('top', 'other')),
  priority_rank   int,            -- 1 = first pick of dates
  priority_basis  jsonb,          -- players, teams, sales per player behind the rank
  last_job_id     uuid references public.jobs(id) on delete set null,
  offered_at      timestamptz,
  responded_at    timestamptz,
  touches         int not null default 0,
  declined_reason text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (company_id, org_id, season)
);
create index season_offers_board_idx on public.season_offers (company_id, season, stage, priority_rank);

-- A hold on a date for a league. The job and photo day exist from the hold on.
create table public.date_holds (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  job_id           uuid not null references public.jobs(id) on delete cascade,
  photo_day_id     uuid not null references public.photo_days(id) on delete cascade,
  offer_id         uuid references public.season_offers(id) on delete set null,
  status           text not null default 'held' check (status in ('held', 'confirmed', 'released')),
  held_on          date not null default current_date,
  expires_on       date not null,
  reminder_sent_at timestamptz,
  extended_by      uuid references public.profiles(id) on delete set null,
  released_at      timestamptz,
  released_reason  text,
  confirmed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (photo_day_id)
);
create index date_holds_open_idx on public.date_holds (company_id, expires_on) where status = 'held';
create index date_holds_job_idx on public.date_holds (job_id);
create index date_holds_offer_idx on public.date_holds (offer_id);

-- New-league inquiries, qualified the same way every time (module 1).
create table public.leads (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  org_id         uuid references public.organizations(id) on delete set null,
  org_name       text not null,
  contact_name   text,
  contact_email  text,
  contact_phone  text,
  teams          int check (teams >= 0),
  participants   int check (participants >= 0),
  sports         text[] not null default '{}',
  preferred_dates text,
  heard_from     text,
  source         text not null default 'other' check (source in ('email', 'website', 'phone', 'referral', 'other')),
  status         text not null default 'new' check (status in ('new', 'qualified', 'offered', 'won', 'lost')),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index leads_company_status_idx on public.leads (company_id, status);

-- Every email, call, portal action and reply with a league, and who made it.
create table public.touchpoints (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  org_id       uuid references public.organizations(id) on delete cascade,
  job_id       uuid references public.jobs(id) on delete set null,
  contact_id   uuid references public.contacts(id) on delete set null,
  offer_id     uuid references public.season_offers(id) on delete set null,
  channel      text not null check (channel in ('email', 'call', 'text', 'portal', 'meeting', 'note')),
  direction    text not null check (direction in ('in', 'out', 'internal')),
  summary      text not null,
  outcome      text,
  actor_id     uuid references public.profiles(id) on delete set null,
  actor_kind   text not null default 'person' check (actor_kind in ('person', 'agent', 'system', 'contact')),
  source_ref   jsonb,           -- message id, action id, file
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index touchpoints_org_idx on public.touchpoints (org_id, occurred_at desc);
create index touchpoints_job_idx on public.touchpoints (job_id);

-- ---------------------------------------------------------------------------
-- Agreement (module 2). The text lives as versions; each signature records
-- the version, the signer and every initialled section.
-- ---------------------------------------------------------------------------
create table public.agreement_versions (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  version      int not null check (version > 0),
  title        text not null,
  -- [{ "key": "rental_fee", "title": "...", "body": "...", "initial": true }]
  sections     jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array'),
  status       text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  notes        text,
  activated_at timestamptz,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (company_id, version)
);
create unique index agreement_versions_one_active_idx on public.agreement_versions (company_id) where status = 'active';

-- A version that has been signed cannot change.
create or replace function private.guard_agreement_version()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.agreement_signatures s where s.version_id = old.id) then
    if tg_op = 'DELETE' or new.sections is distinct from old.sections or new.title is distinct from old.title
       or new.version is distinct from old.version then
      raise exception 'agreement version % has signatures and cannot change; make a new version', old.version;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function private.guard_agreement_version() from public;

create table public.agreement_signatures (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  job_id            uuid not null references public.jobs(id) on delete cascade,
  version_id        uuid not null references public.agreement_versions(id) on delete restrict,
  signer_profile_id uuid references public.profiles(id) on delete set null,
  signer_name       text not null,
  signer_email      text not null,
  initials          jsonb not null default '{}'::jsonb,   -- { section_key: "JH" }
  ip_address        inet,
  user_agent        text,
  pdf_path          text,
  signed_at         timestamptz not null default now()
);
create index agreement_signatures_job_idx on public.agreement_signatures (job_id, signed_at desc);
create index agreement_signatures_version_idx on public.agreement_signatures (version_id);

create trigger agreement_versions_guard before update or delete on public.agreement_versions
  for each row execute function private.guard_agreement_version();

-- Signatures are permanent records.
create or replace function private.forbid_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and tg_table_name = 'agreement_signatures'
     and new.pdf_path is distinct from old.pdf_path
     and (to_jsonb(new) - 'pdf_path') = (to_jsonb(old) - 'pdf_path') then
    return new;  -- filing the PDF copy is the one change allowed
  end if;
  raise exception '% rows cannot be changed or removed', tg_table_name;
end;
$$;
revoke all on function private.forbid_change() from public;
create trigger agreement_signatures_immutable before update or delete on public.agreement_signatures
  for each row execute function private.forbid_change();

-- ---------------------------------------------------------------------------
-- Capacity: stations spoken for per date, from every live job's photo days.
-- ---------------------------------------------------------------------------
create view public.date_capacity with (security_invoker = true) as
select
  pd.company_id,
  pd.date,
  sum(pd.stations)::int                                         as stations_used,
  sum(pd.stations) filter (where j.status = 'held')::int        as stations_held,
  count(distinct j.id)::int                                     as jobs
from public.photo_days pd
join public.jobs j on j.id = pd.job_id
where j.status not in ('released', 'cancelled')
group by pd.company_id, pd.date;
grant select on public.date_capacity to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Triggers, RLS, grants
-- ---------------------------------------------------------------------------
create trigger season_offers_updated_at before update on public.season_offers
  for each row execute function private.set_updated_at();
create trigger date_holds_updated_at before update on public.date_holds
  for each row execute function private.set_updated_at();
create trigger leads_updated_at before update on public.leads
  for each row execute function private.set_updated_at();
create trigger agreement_versions_updated_at before update on public.agreement_versions
  for each row execute function private.set_updated_at();

create trigger season_offers_log after insert or update or delete on public.season_offers
  for each row execute function private.log_row_change();
create trigger date_holds_log after insert or update or delete on public.date_holds
  for each row execute function private.log_row_change();
create trigger leads_log after insert or update or delete on public.leads
  for each row execute function private.log_row_change();
create trigger agreement_versions_log after insert or update or delete on public.agreement_versions
  for each row execute function private.log_row_change();
create trigger agreement_signatures_log after insert or update on public.agreement_signatures
  for each row execute function private.log_row_change();

alter table public.season_offers        enable row level security;
alter table public.date_holds           enable row level security;
alter table public.leads                enable row level security;
alter table public.touchpoints          enable row level security;
alter table public.agreement_versions   enable row level security;
alter table public.agreement_signatures enable row level security;

grant select, insert, update, delete on public.season_offers, public.date_holds, public.leads,
  public.touchpoints, public.agreement_versions to authenticated;
grant select on public.agreement_signatures to authenticated;   -- written only by the signing function
grant all on public.season_offers, public.date_holds, public.leads, public.touchpoints,
  public.agreement_versions, public.agreement_signatures to service_role;

-- Offers and leads: staff read, office writes, owner and admin delete.
do $$
declare
  t text;
begin
  foreach t in array array['season_offers', 'leads'] loop
    execute format($p$create policy %1$s_select on public.%1$I for select to authenticated
      using (company_id = (select private.current_company_id()) and (select private.is_staff()))$p$, t);
    execute format($p$create policy %1$s_insert on public.%1$I for insert to authenticated
      with check (company_id = (select private.current_company_id()) and (select private.can_edit_ops()))$p$, t);
    execute format($p$create policy %1$s_update on public.%1$I for update to authenticated
      using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()))
      with check (company_id = (select private.current_company_id()))$p$, t);
    execute format($p$create policy %1$s_delete on public.%1$I for delete to authenticated
      using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()))$p$, t);
  end loop;
end;
$$;
-- Support logs new inquiries too.
create policy leads_insert_support on public.leads for insert to authenticated
  with check (company_id = (select private.current_company_id()) and (select private.is_staff()));

-- Holds: the job's coordinator sees the hold on their job (to confirm it).
create policy date_holds_select on public.date_holds for select to authenticated
  using ((select private.can_see_job(job_id)));
create policy date_holds_insert on public.date_holds for insert to authenticated
  with check (company_id = (select private.current_company_id()) and (select private.can_edit_ops()));
create policy date_holds_update on public.date_holds for update to authenticated
  using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()))
  with check (company_id = (select private.current_company_id()));
create policy date_holds_delete on public.date_holds for delete to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));

-- Touchpoints: any staff role reads and logs one (a call, a note).
create policy touchpoints_select on public.touchpoints for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_staff()));
create policy touchpoints_insert on public.touchpoints for insert to authenticated
  with check (company_id = (select private.current_company_id()) and (select private.is_staff())
              and actor_kind = 'person');
create policy touchpoints_delete on public.touchpoints for delete to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));

-- Agreement text: staff read every version; a coordinator reads the active
-- one and any version signed on their job; owner and admin edit.
create policy agreement_versions_select on public.agreement_versions for select to authenticated
  using (company_id = (select private.current_company_id())
         and ((select private.is_staff())
              or ((select private.has_role('coordinator'))
                  and (status = 'active'
                       or exists (select 1 from public.agreement_signatures s
                                  where s.version_id = agreement_versions.id
                                    and (select private.can_see_job(s.job_id)))))));
create policy agreement_versions_insert on public.agreement_versions for insert to authenticated
  with check (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));
create policy agreement_versions_update on public.agreement_versions for update to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()))
  with check (company_id = (select private.current_company_id()));
create policy agreement_versions_delete on public.agreement_versions for delete to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));

create policy agreement_signatures_select on public.agreement_signatures for select to authenticated
  using ((select private.can_see_job(job_id)));
