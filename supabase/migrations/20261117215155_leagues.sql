-- =============================================================================
-- Leagues: organizations, contacts, terms and notes (spec: data model, Leagues).
-- A league carries contacts, history, terms and lessons across seasons.
-- Season is derived from photo-day dates, never stored.
-- =============================================================================

create type public.org_type as enum ('league', 'club', 'swim_team', 'school', 'single_team', 'other');
create type public.delivery_method as enum ('league_delivery', 'mailer');

create table public.organizations (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  name            text not null,
  short_name      text,
  org_type        public.org_type not null default 'league',
  relationship    text,          -- sales stage as kept in Notion (Lead ... Customer, Lost)
  active          boolean not null default true,
  sports          text[] not null default '{}',
  seasons         text[] not null default '{}',   -- seasons the league usually shoots
  website         text,
  email           text,
  phone           text,
  address         text,
  size_note       text,
  history         text,
  notion_page_id  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (company_id, notion_page_id)
);
create index organizations_company_idx on public.organizations (company_id, active);

create table public.contacts (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies(id) on delete cascade,
  full_name          text not null,
  email              text,
  phone              text,
  role_title         text,
  preferred_channel  text check (preferred_channel in ('email', 'text', 'phone')),
  active_state       text check (active_state in ('yes', 'no', 'unsure')),
  years_active       int[] not null default '{}',
  notes              text,
  notion_page_id     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (company_id, notion_page_id)
);
create index contacts_company_idx on public.contacts (company_id);
create index contacts_email_idx on public.contacts (company_id, lower(email));

-- Who holds which role at a league, with dates, so coordinator changes keep a history.
create table public.organization_contacts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  role        text,
  is_primary  boolean not null default false,
  started_on  date,
  ended_on    date,
  created_at  timestamptz not null default now(),
  unique (org_id, contact_id)
);
create index organization_contacts_contact_idx on public.organization_contacts (contact_id);

-- Agreed terms. Delivery and team photo type are typed now; `services` keeps
-- the raw Notion Services options until module 1 maps all 44 to typed fields.
create table public.organization_terms (
  org_id            uuid primary key references public.organizations(id) on delete cascade,
  company_id        uuid not null references public.companies(id) on delete cascade,
  delivery_method   public.delivery_method,
  team_photo_types  text[] not null default '{}',
  services          text[] not null default '{}',
  updated_at        timestamptz not null default now()
);

create table public.league_notes (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  kind        text not null default 'note' check (kind in ('note', 'lesson', 'history')),
  body        text not null,
  source      text,
  author_id   uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index league_notes_org_idx on public.league_notes (org_id, created_at desc);

create trigger organizations_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();
create trigger contacts_updated_at before update on public.contacts
  for each row execute function private.set_updated_at();
create trigger organization_terms_updated_at before update on public.organization_terms
  for each row execute function private.set_updated_at();

create trigger organizations_log after insert or update or delete on public.organizations
  for each row execute function private.log_row_change();
create trigger contacts_log after insert or update or delete on public.contacts
  for each row execute function private.log_row_change();
create trigger organization_contacts_log after insert or update or delete on public.organization_contacts
  for each row execute function private.log_row_change();
create trigger organization_terms_log after insert or update or delete on public.organization_terms
  for each row execute function private.log_row_change();
create trigger league_notes_log after insert or update or delete on public.league_notes
  for each row execute function private.log_row_change();

-- RLS: every staff role reads (support reads); owner, admin and office write;
-- owner and admin delete. Crew, coordinators and anonymous see none of it.
do $$
declare
  t text;
begin
  foreach t in array array['organizations', 'contacts', 'organization_contacts', 'organization_terms', 'league_notes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
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
