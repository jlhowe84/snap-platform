-- =============================================================================
-- Jobs and photo days (spec: data model, Jobs). A job is one pass through the
-- yearly loop for a league; it has one or more photo days.
-- =============================================================================

create type public.job_status as enum (
  'planning', 'in_production', 'at_lab', 'delivered', 'complete', 'archived', 'cancelled'
);
create type public.production_stage as enum (
  'import', 'editing', 'upload', 'composites', 'gallery_prep', 'qa_marketing', 'complete'
);

create table public.jobs (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid not null references public.companies(id) on delete cascade,
  org_id                  uuid references public.organizations(id) on delete set null,
  name                    text not null,
  job_type                text not null default 'photo_day' check (job_type in ('photo_day', 'event')),
  status                  public.job_status not null default 'planning',
  lab                     text check (lab in ('marco', 'alkit', 'skylab')),
  production_stage        public.production_stage,
  sports                  text[] not null default '{}',
  expected_teams          int check (expected_teams >= 0),
  expected_subjects       int check (expected_subjects >= 0),
  delivery_method         public.delivery_method,
  team_photo_type         text check (team_photo_type in ('composite', 'traditional')),
  sponsors                boolean,
  promo                   text,
  coupon                  text,
  -- Planning stage as typed in Notion. Import trail only: in the platform,
  -- readiness is computed from events (principle 3), never typed.
  imported_planning_stage text,
  notes                   text,
  notion_page_id          text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (company_id, notion_page_id)
);
create index jobs_company_status_idx on public.jobs (company_id, status);
create index jobs_org_idx on public.jobs (org_id);

create table public.photo_days (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies(id) on delete cascade,
  job_id               uuid not null references public.jobs(id) on delete cascade,
  date                 date not null,
  original_date        date,      -- kept when a date moves (date change cascade)
  start_time           time,
  end_time             time,
  label                text,
  location_name        text,
  address              text,
  city                 text,
  state                text,
  zip                  text,
  location_details     text,
  indoor               boolean,   -- null = unknown, never assumed
  alt_indoor_location  text,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index photo_days_job_idx on public.photo_days (job_id, date);
create index photo_days_company_date_idx on public.photo_days (company_id, date);

-- Outside references for a job. Captura gallery id, shop link, Drive, and the
-- Notion page kept as a migration trail.
create table public.job_links (
  job_id              uuid primary key references public.jobs(id) on delete cascade,
  company_id          uuid not null references public.companies(id) on delete cascade,
  captura_gallery_id  bigint,
  online_shop_url     text,
  drive_folder_url    text,
  notion_page_url     text,
  updated_at          timestamptz not null default now()
);

-- Contacts named on a job (the coordinator for that photo day).
create table public.job_contacts (
  job_id      uuid not null references public.jobs(id) on delete cascade,
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  role        text not null default 'coordinator',
  primary key (job_id, contact_id)
);

-- Portal access: which coordinator sessions may see which job. Filled by the
-- per-job magic link flow in Wave A. Several coordinators per job.
create table public.job_coordinators (
  job_id      uuid not null references public.jobs(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (job_id, profile_id)
);
create index job_coordinators_profile_idx on public.job_coordinators (profile_id);

create trigger jobs_updated_at before update on public.jobs
  for each row execute function private.set_updated_at();
create trigger photo_days_updated_at before update on public.photo_days
  for each row execute function private.set_updated_at();
create trigger job_links_updated_at before update on public.job_links
  for each row execute function private.set_updated_at();

create trigger jobs_log after insert or update or delete on public.jobs
  for each row execute function private.log_row_change();
create trigger photo_days_log after insert or update or delete on public.photo_days
  for each row execute function private.log_row_change();
create trigger job_links_log after insert or update or delete on public.job_links
  for each row execute function private.log_row_change();
create trigger job_contacts_log after insert or delete on public.job_contacts
  for each row execute function private.log_row_change();
create trigger job_coordinators_log after insert or delete on public.job_coordinators
  for each row execute function private.log_row_change();

-- Staff of the job's company, or a coordinator linked to the job.
create or replace function private.can_see_job(p_job_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.jobs j
    where j.id = p_job_id
      and j.company_id = private.current_company_id()
      and (
        private.is_staff()
        or (private.has_role('coordinator')
            and exists (select 1 from public.job_coordinators c
                        where c.job_id = p_job_id and c.profile_id = auth.uid()))
      )
  )
$$;
revoke all on function private.can_see_job(uuid) from public;
grant execute on function private.can_see_job(uuid) to authenticated, service_role;

-- Season is a derived label from the earliest photo day (meteorological
-- seasons; December rolls into that year's Winter). Never stored.
create or replace function public.season_label(p_date date)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_date is null then null
    when extract(month from p_date) in (12, 1, 2) then 'Winter '
    when extract(month from p_date) between 3 and 5 then 'Spring '
    when extract(month from p_date) between 6 and 8 then 'Summer '
    else 'Fall '
  end || extract(year from p_date)::int
$$;

create view public.job_overview with (security_invoker = true) as
select
  j.id,
  j.company_id,
  j.org_id,
  o.name                          as org_name,
  j.name,
  j.status,
  j.lab,
  j.production_stage,
  j.sports,
  j.expected_teams,
  j.delivery_method,
  min(pd.date)                    as first_date,
  max(pd.date)                    as last_date,
  count(pd.id)::int               as photo_day_count,
  public.season_label(min(pd.date)) as season
from public.jobs j
left join public.organizations o on o.id = j.org_id
left join public.photo_days pd on pd.job_id = j.id
group by j.id, o.name;

grant select on public.job_overview to authenticated, service_role;

-- RLS
alter table public.jobs enable row level security;
alter table public.photo_days enable row level security;
alter table public.job_links enable row level security;
alter table public.job_contacts enable row level security;
alter table public.job_coordinators enable row level security;

grant select, insert, update, delete on public.jobs, public.photo_days, public.job_links,
  public.job_contacts, public.job_coordinators to authenticated;
grant all on public.jobs, public.photo_days, public.job_links, public.job_contacts,
  public.job_coordinators to service_role;

create policy jobs_select on public.jobs for select to authenticated
  using ((select private.can_see_job(id)));
create policy jobs_insert on public.jobs for insert to authenticated
  with check (company_id = (select private.current_company_id()) and (select private.can_edit_ops()));
create policy jobs_update on public.jobs for update to authenticated
  using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()))
  with check (company_id = (select private.current_company_id()));
create policy jobs_delete on public.jobs for delete to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));

do $$
declare
  t text;
begin
  foreach t in array array['photo_days', 'job_links', 'job_contacts'] loop
    execute format($p$create policy %1$s_select on public.%1$I for select to authenticated
      using ((select private.can_see_job(job_id)))$p$, t);
    execute format($p$create policy %1$s_insert on public.%1$I for insert to authenticated
      with check (company_id = (select private.current_company_id()) and (select private.can_edit_ops()))$p$, t);
    execute format($p$create policy %1$s_update on public.%1$I for update to authenticated
      using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()))
      with check (company_id = (select private.current_company_id()))$p$, t);
    execute format($p$create policy %1$s_delete on public.%1$I for delete to authenticated
      using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()))$p$, t);
  end loop;
end;
$$;

-- Coordinator links: staff see them; only owner, admin and office manage them.
-- A coordinator sees their own rows. (The magic-link flow writes with the
-- service role and refuses staff emails; spec: security carried over.)
create policy job_coordinators_select on public.job_coordinators for select to authenticated
  using (profile_id = (select auth.uid())
         or (company_id = (select private.current_company_id()) and (select private.is_staff())));
create policy job_coordinators_insert on public.job_coordinators for insert to authenticated
  with check (company_id = (select private.current_company_id()) and (select private.can_edit_ops()));
create policy job_coordinators_delete on public.job_coordinators for delete to authenticated
  using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()));
