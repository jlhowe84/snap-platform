-- =============================================================================
-- Notion import (spec: Migration and cutover). Raw Notion rows are loaded into
-- a private staging table, then private.import_notion() maps them into the
-- platform's tables. It is idempotent: re-running updates rows matched on
-- notion_page_id and adds new ones, so the import can be refreshed until
-- cutover. Notion stays the source of truth until then.
--
-- Staged props use the column names of Notion's SQL view of each database.
-- Sources: accounts, contacts, jobs, staff, templates.
-- Booth jobs (Job Type = Photo Booth) are skipped: booths stay in Check Cherry.
-- Staff birthdates and street addresses are not imported (only what the
-- platform needs).
-- =============================================================================

create table private.notion_staging (
  source     text not null check (source in ('accounts', 'contacts', 'jobs', 'staff', 'templates')),
  page_id    text not null,
  props      jsonb not null,
  loaded_at  timestamptz not null default now(),
  primary key (source, page_id)
);
alter table private.notion_staging enable row level security;
revoke all on private.notion_staging from public, authenticated;

-- 32-hex Notion page id from a page URL or id, dashes removed.
create or replace function private.notion_id(p text)
returns text language sql immutable set search_path = '' as $$
  select lower(substring(replace(p, '-', '') from '([0-9a-fA-F]{32})(?:[^0-9a-fA-F]|$)'))
$$;

-- A Notion multi-value cell (a JSON array, or JSON array text) as text[].
create or replace function private.notion_list(p jsonb)
returns text[] language sql immutable set search_path = '' as $$
  select coalesce(array(
    select trim(both from x)
    from jsonb_array_elements_text(
      case
        when p is null or p = 'null'::jsonb then '[]'::jsonb
        when jsonb_typeof(p) = 'array' then p
        when jsonb_typeof(p) = 'string' and left(p #>> '{}', 1) = '[' then (p #>> '{}')::jsonb
        when jsonb_typeof(p) = 'string' and p #>> '{}' <> '' then jsonb_build_array(p #>> '{}')
        else '[]'::jsonb
      end) x
    where trim(both from x) <> ''
  ), '{}')
$$;

create or replace function private.notion_text(p jsonb, k text)
returns text language sql immutable set search_path = '' as $$
  select nullif(trim(both from p ->> k), '')
$$;

-- "5:00 PM", "5 pm", "17:30" -> time, else null.
create or replace function private.parse_clock(p text)
returns time language plpgsql immutable set search_path = '' as $$
declare
  m text[];
  h int;
begin
  if p is null then return null; end if;
  m := regexp_match(p, '(\d{1,2})(?::(\d{2}))?\s*([AaPp])?\.?\s*[Mm]?');
  if m is null then return null; end if;
  h := m[1]::int;
  if m[3] is not null then
    if lower(m[3]) = 'p' and h < 12 then h := h + 12; end if;
    if lower(m[3]) = 'a' and h = 12 then h := 0; end if;
  end if;
  if h > 23 then return null; end if;
  return make_time(h, coalesce(m[2], '0')::int, 0);
end;
$$;

create or replace function private.import_notion(p_company uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  n_orgs int; n_contacts int; n_org_links int; n_crew int; n_steps int;
  n_jobs int; n_days int; n_job_contacts int;
  v_planning uuid; v_production uuid;
begin
  -- Leagues ------------------------------------------------------------------
  insert into public.organizations as o (
    company_id, name, relationship, active, sports, seasons, website, email, phone,
    address, size_note, history, notion_page_id)
  select p_company,
         coalesce(private.notion_text(s.props, 'Name'), '(no name in Notion)'),
         private.notion_text(s.props, 'Relationship'),
         coalesce(s.props ->> 'Active', '') = '__YES__',
         private.notion_list(s.props -> 'Sports'),
         private.notion_list(s.props -> 'Season'),
         private.notion_text(s.props, 'Website'),
         private.notion_text(s.props, 'Email'),
         private.notion_text(s.props, 'Phone Number'),
         private.notion_text(s.props, 'League Address'),
         private.notion_text(s.props, 'Size of League'),
         private.notion_text(s.props, 'History'),
         s.page_id
  from private.notion_staging s where s.source = 'accounts'
  on conflict (company_id, notion_page_id) do update set
    name = excluded.name, relationship = excluded.relationship, active = excluded.active,
    sports = excluded.sports, seasons = excluded.seasons, website = excluded.website,
    email = excluded.email, phone = excluded.phone, address = excluded.address,
    size_note = excluded.size_note, history = excluded.history;
  get diagnostics n_orgs = row_count;

  insert into public.organization_terms as t (org_id, company_id, delivery_method, team_photo_types, services)
  select o.id, p_company,
         case private.notion_text(s.props, 'Deliver or Mailer')
           when 'Deliver to League' then 'league_delivery'::public.delivery_method
           when 'Mailer' then 'mailer'::public.delivery_method
         end,
         private.notion_list(s.props -> 'Team Photo Type'),
         private.notion_list(s.props -> 'Services')
  from private.notion_staging s
  join public.organizations o on o.company_id = p_company and o.notion_page_id = s.page_id
  where s.source = 'accounts'
  on conflict (org_id) do update set
    delivery_method = excluded.delivery_method, team_photo_types = excluded.team_photo_types,
    services = excluded.services;

  -- Contacts -----------------------------------------------------------------
  insert into public.contacts as c (
    company_id, full_name, email, phone, role_title, preferred_channel, active_state,
    years_active, notes, notion_page_id)
  select p_company,
         coalesce(private.notion_text(s.props, 'Name'), '(no name in Notion)'),
         private.notion_text(s.props, 'Email'),
         private.notion_text(s.props, 'Phone'),
         private.notion_text(s.props, 'Role'),
         case private.notion_text(s.props, 'Preferred Contact Method')
           when 'Text' then 'text' when 'Email' then 'email' when 'Phone Call' then 'phone' end,
         case lower(coalesce(private.notion_text(s.props, 'Active'), ''))
           when 'yes' then 'yes' when 'no' then 'no' when 'unsure' then 'unsure' end,
         coalesce(array(select y::int from unnest(private.notion_list(s.props -> 'Year Active')) y
                        where y ~ '^\d{4}$' order by 1), '{}'),
         private.notion_text(s.props, 'Notes'),
         s.page_id
  from private.notion_staging s where s.source = 'contacts'
  on conflict (company_id, notion_page_id) do update set
    full_name = excluded.full_name, email = excluded.email, phone = excluded.phone,
    role_title = excluded.role_title, preferred_channel = excluded.preferred_channel,
    active_state = excluded.active_state, years_active = excluded.years_active, notes = excluded.notes;
  get diagnostics n_contacts = row_count;

  -- League <-> contact links, from both sides of the Notion relation.
  insert into public.organization_contacts (company_id, org_id, contact_id, role)
  select distinct on (o.id, c.id) p_company, o.id, c.id, c.role_title
  from (
    select s.page_id as org_page, private.notion_id(u) as contact_page
    from private.notion_staging s,
         unnest(private.notion_list(s.props -> 'Contacts') || private.notion_list(s.props -> 'Contacts 1')) u
    where s.source = 'accounts'
    union
    select private.notion_id(u), s.page_id
    from private.notion_staging s, unnest(private.notion_list(s.props -> 'Accounts Database')) u
    where s.source = 'contacts'
  ) l
  join public.organizations o on o.company_id = p_company and o.notion_page_id = l.org_page
  join public.contacts c on c.company_id = p_company and c.notion_page_id = l.contact_page
  on conflict (org_id, contact_id) do nothing;
  get diagnostics n_org_links = row_count;

  -- Crew ---------------------------------------------------------------------
  insert into public.crew_members as m (
    company_id, full_name, email, phone, city, state, positions, level, active, notion_page_id)
  select p_company,
         coalesce(private.notion_text(s.props, 'Employee Name'), '(no name in Notion)'),
         private.notion_text(s.props, 'Email'),
         private.notion_text(s.props, 'Phone'),
         private.notion_text(s.props, 'City'),
         private.notion_text(s.props, 'State'),
         coalesce(array(
           select distinct case p
             when 'Photographer' then 'photographer' when 'Poser' then 'poser'
             when 'Coordinator' then 'coordinator' when 'Photo Attendant' then 'photo_attendant'
             when 'Office' then 'office' end
           from unnest(private.notion_list(s.props -> 'Positions')) p
           where p in ('Photographer', 'Poser', 'Coordinator', 'Photo Attendant', 'Office')), '{}'),
         case when private.notion_text(s.props, 'Level') ~ '^[1-5]$'
              then private.notion_text(s.props, 'Level')::smallint end,
         coalesce(private.notion_text(s.props, 'Status'), 'Active') = 'Active',
         s.page_id
  from private.notion_staging s where s.source = 'staff'
  on conflict (company_id, notion_page_id) do update set
    full_name = excluded.full_name, email = excluded.email, phone = excluded.phone,
    city = excluded.city, state = excluded.state, positions = excluded.positions,
    level = excluded.level, active = excluded.active;
  get diagnostics n_crew = row_count;

  -- Playbooks from Job Task Templates ----------------------------------------
  insert into public.playbooks (company_id, key, name, kind, notes)
  values (p_company, 'planning_notion', 'Planning (from Notion templates)', 'planning',
          'Imported from Notion Job Task Templates. Owners, timing and evidence are set with Josh in the playbook session.'),
         (p_company, 'production_notion', 'Production (from Notion templates)', 'production',
          'Imported from Notion Job Task Templates. Owners, timing and evidence are set with Josh in the playbook session.')
  on conflict (company_id, key) do nothing;
  select id into v_planning from public.playbooks where company_id = p_company and key = 'planning_notion';
  select id into v_production from public.playbooks where company_id = p_company and key = 'production_notion';

  insert into public.playbook_steps as ps (
    company_id, playbook_id, position, name, description, stage, offset_text, offset_days,
    owner_hint, priority, tags, active, notion_page_id)
  select p_company,
         case private.notion_text(s.props, 'Type') when 'Job Production' then v_production else v_planning end,
         coalesce((s.props ->> 'Order')::numeric, 999),
         coalesce(private.notion_text(s.props, 'Name'), '(no name in Notion)'),
         private.notion_text(s.props, 'Description'),
         private.notion_text(s.props, 'Production Stage'),
         private.notion_text(s.props, 'Due Date Offset'),
         (regexp_match(coalesce(s.props ->> 'Due Date Offset', ''), '^\s*([+-]?\d+)\s*d'))[1]::int,
         nullif(array_to_string(private.notion_list(s.props -> 'Assigned To'), ', '), ''),
         private.notion_text(s.props, 'Priority'),
         private.notion_list(s.props -> 'Tags'),
         coalesce(s.props ->> 'Active', '') = '__YES__',
         s.page_id
  from private.notion_staging s
  where s.source = 'templates' and private.notion_text(s.props, 'Type') in ('Job Planning', 'Job Production')
  on conflict (company_id, notion_page_id) do update set
    playbook_id = excluded.playbook_id, position = excluded.position, name = excluded.name,
    description = excluded.description, stage = excluded.stage, offset_text = excluded.offset_text,
    offset_days = excluded.offset_days, owner_hint = excluded.owner_hint,
    priority = excluded.priority, tags = excluded.tags, active = excluded.active;
  get diagnostics n_steps = row_count;

  -- Jobs ---------------------------------------------------------------------
  insert into public.jobs as j (
    company_id, org_id, name, job_type, status, lab, production_stage, sports,
    expected_teams, expected_subjects, delivery_method, team_photo_type, sponsors, promo,
    coupon, imported_planning_stage, notion_page_id)
  select p_company,
         (select o.id from public.organizations o
          where o.company_id = p_company
            and o.notion_page_id = private.notion_id((private.notion_list(s.props -> 'Account'))[1])),
         coalesce(private.notion_text(s.props, 'Name'), '(no name in Notion)'),
         case private.notion_text(s.props, 'Job Type') when 'Event' then 'event' else 'photo_day' end,
         case private.notion_text(s.props, 'Status')
           when 'In Production' then 'in_production'
           when 'Marco' then 'at_lab' when 'Alkit' then 'at_lab'
           when 'Delivered' then 'delivered' when 'Complete' then 'complete'
           when 'Archived' then 'archived' when 'Cancelled' then 'cancelled'
           else 'planning' end::public.job_status,
         case private.notion_text(s.props, 'Status') when 'Marco' then 'marco' when 'Alkit' then 'alkit' end,
         case private.notion_text(s.props, 'Current Production Stage')
           when 'Import' then 'import' when 'Editing' then 'editing' when 'Upload' then 'upload'
           when 'Composites' then 'composites' when 'Gallery Prep' then 'gallery_prep'
           when 'QA/Marketing' then 'qa_marketing' when 'Complete' then 'complete'
         end::public.production_stage,
         private.notion_list(s.props -> 'Sport'),
         nullif(s.props ->> 'Approx # of teams', '')::numeric::int,
         nullif(s.props ->> 'Roster Subjects', '')::numeric::int,
         case private.notion_text(s.props, 'Delivery Method')
           when 'League Delivery' then 'league_delivery'::public.delivery_method
           when 'Mailer' then 'mailer'::public.delivery_method end,
         case private.notion_text(s.props, 'Team Format')
           when 'Composite Team' then 'composite' when 'Traditional Team' then 'traditional' end,
         case private.notion_text(s.props, 'Sponsors') when 'Yes' then true when 'No' then false end,
         private.notion_text(s.props, 'Promo'),
         private.notion_text(s.props, 'Coupon'),
         private.notion_text(s.props, 'Current Planning Stage'),
         s.page_id
  from private.notion_staging s
  where s.source = 'jobs' and coalesce(private.notion_text(s.props, 'Job Type'), '') <> 'Photo Booth'
  on conflict (company_id, notion_page_id) do update set
    org_id = excluded.org_id, name = excluded.name, job_type = excluded.job_type,
    status = excluded.status, lab = excluded.lab, production_stage = excluded.production_stage,
    sports = excluded.sports, expected_teams = excluded.expected_teams,
    expected_subjects = excluded.expected_subjects, delivery_method = excluded.delivery_method,
    team_photo_type = excluded.team_photo_type, sponsors = excluded.sponsors, promo = excluded.promo,
    coupon = excluded.coupon, imported_planning_stage = excluded.imported_planning_stage;
  get diagnostics n_jobs = row_count;

  -- One photo day per Notion job (Notion holds one date per job). Re-running
  -- replaces the imported day only while the job has exactly one photo day.
  with src as (
    select j.id as job_id, s.props,
           nullif(s.props ->> 'date:Date:start', '') as d_start,
           nullif(s.props ->> 'date:Date:end', '') as d_end,
           coalesce((s.props ->> 'date:Date:is_datetime')::int, 0) = 1 as has_time
    from private.notion_staging s
    join public.jobs j on j.company_id = p_company and j.notion_page_id = s.page_id
    where s.source = 'jobs'
  ), del as (
    delete from public.photo_days pd
    using src
    where pd.job_id = src.job_id and src.d_start is not null
      and (select count(*) from public.photo_days x where x.job_id = src.job_id) = 1
    returning pd.job_id
  )
  insert into public.photo_days (
    company_id, job_id, date, start_time, end_time, location_name, address, city, state, zip,
    location_details, indoor, alt_indoor_location)
  select p_company, src.job_id,
         left(src.d_start, 10)::date,
         case when src.has_time then substring(src.d_start from 12 for 5)::time
              else private.parse_clock(private.notion_text(src.props, 'Start Time')) end,
         case when src.has_time and src.d_end is not null then substring(src.d_end from 12 for 5)::time end,
         private.notion_text(src.props, 'Location Name'),
         private.notion_text(src.props, 'Location Address'),
         private.notion_text(src.props, 'Location City'),
         private.notion_text(src.props, 'Location State'),
         private.notion_text(src.props, 'Location Zip'),
         private.notion_text(src.props, 'Location Details'),
         case private.notion_text(src.props, 'Outside / Inside') when 'Inside' then true when 'Outside' then false end,
         private.notion_text(src.props, 'Alt Indoor Location Name')
  from src
  where src.d_start is not null
    and (src.job_id in (select job_id from del)
         or not exists (select 1 from public.photo_days x where x.job_id = src.job_id));
  get diagnostics n_days = row_count;

  insert into public.job_links as l (job_id, company_id, captura_gallery_id, online_shop_url, notion_page_url)
  select j.id, p_company,
         nullif(s.props ->> 'Captura Job ID', '')::numeric::bigint,
         private.notion_text(s.props, 'Online Shop URL'),
         'https://app.notion.com/p/' || s.page_id
  from private.notion_staging s
  join public.jobs j on j.company_id = p_company and j.notion_page_id = s.page_id
  where s.source = 'jobs'
  on conflict (job_id) do update set
    captura_gallery_id = excluded.captura_gallery_id, online_shop_url = excluded.online_shop_url,
    notion_page_url = excluded.notion_page_url;

  insert into public.job_contacts (job_id, contact_id, company_id)
  select distinct j.id, c.id, p_company
  from private.notion_staging s
  join public.jobs j on j.company_id = p_company and j.notion_page_id = s.page_id
  cross join lateral unnest(private.notion_list(s.props -> 'Contacts') || private.notion_list(s.props -> 'Contacts 1')) u
  join public.contacts c on c.company_id = p_company and c.notion_page_id = private.notion_id(u)
  where s.source = 'jobs'
  on conflict do nothing;
  get diagnostics n_job_contacts = row_count;

  update public.integration_status
  set last_success_at = now(), last_error = null,
      details = jsonb_build_object('staged', (select jsonb_object_agg(source, n) from
                 (select source, count(*) n from private.notion_staging group by source) x))
  where company_id = p_company and integration = 'notion_import';

  return jsonb_build_object(
    'organizations', n_orgs, 'contacts', n_contacts, 'organization_contacts', n_org_links,
    'crew_members', n_crew, 'playbook_steps', n_steps, 'jobs', n_jobs,
    'photo_days', n_days, 'job_contacts', n_job_contacts);
end;
$$;
revoke all on function private.import_notion(uuid) from public, authenticated;
