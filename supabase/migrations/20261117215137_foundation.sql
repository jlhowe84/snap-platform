-- =============================================================================
-- Foundation: companies, settings, people and roles, the activity log.
--
-- Rules every later migration follows (spec: Architecture and security, and
-- the early decisions in Future direction):
--   * Every table carries company_id, and every policy checks it.
--   * RLS is the single gate. No table ships without policies.
--   * "Automatically expose new tables" is off on this project, so each table
--     grants its privileges to `authenticated` explicitly. `anon` gets nothing.
--   * Helper functions live in the `private` schema, which the Data API does
--     not expose. They are SECURITY DEFINER with an empty search_path.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Roles. One person can hold several (spec: Roles and permissions).
-- ---------------------------------------------------------------------------
create type public.app_role as enum (
  'owner', 'admin', 'office', 'support', 'crew', 'coordinator'
);

-- ---------------------------------------------------------------------------
-- Companies. One row today (SNAP). Decision 1: a company on every record.
-- ---------------------------------------------------------------------------
create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name        text not null,
  time_zone   text not null default 'America/New_York',  -- decision 4
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Settings: every number the spec calls a setting lives here as data
-- (module 18), including brand (decision 3) and sign-in domains (decision 2).
-- Secrets never live here; they go to Vault (see integration secrets).
create table public.settings (
  company_id  uuid not null references public.companies(id) on delete cascade,
  key         text not null check (key ~ '^[a-z0-9_.]+$'),
  value       jsonb not null,
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  primary key (company_id, key)
);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  company_id  uuid references public.companies(id) on delete set null,
  email       text not null,
  full_name   text,
  avatar_url  text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profiles_company_idx on public.profiles(company_id);

create table public.profile_roles (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  role        public.app_role not null,
  granted_by  uuid,
  granted_at  timestamptz not null default now(),
  primary key (profile_id, role)
);
create index profile_roles_company_idx on public.profile_roles(company_id);

-- Invites are the gate for staff access: a Google sign-in with no invite gets
-- a profile with no company and no roles, and so sees nothing.
create table public.staff_invites (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  email       text not null,
  roles       public.app_role[] not null check (cardinality(roles) > 0),
  invited_by  uuid,
  created_at  timestamptz not null default now(),
  used_at     timestamptz,
  used_by     uuid
);
create unique index staff_invites_open_email_idx
  on public.staff_invites (company_id, lower(email)) where used_at is null;

-- ---------------------------------------------------------------------------
-- Helper functions (used inside policies; wrap calls in (select ...) there)
-- ---------------------------------------------------------------------------
create or replace function private.current_company_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.company_id from public.profiles p where p.id = auth.uid() and p.active
$$;

create or replace function private.has_any_role(p_roles public.app_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.profile_roles r
    join public.profiles p on p.id = r.profile_id
    where r.profile_id = auth.uid()
      and p.active
      and r.company_id = p.company_id
      and r.role = any (p_roles)
  )
$$;

create or replace function private.has_role(p_role public.app_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_any_role(array[p_role])
$$;

-- Staff = the office and owner doors (owner, admin, office, support).
create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_any_role('{owner,admin,office,support}'::public.app_role[])
$$;

-- May edit leagues, jobs, schedules, rosters (owner, admin, office).
create or replace function private.can_edit_ops()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_any_role('{owner,admin,office}'::public.app_role[])
$$;

create or replace function private.is_owner_or_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_any_role('{owner,admin}'::public.app_role[])
$$;

revoke all on function private.current_company_id() from public;
revoke all on function private.has_any_role(public.app_role[]) from public;
revoke all on function private.has_role(public.app_role) from public;
revoke all on function private.is_staff() from public;
revoke all on function private.can_edit_ops() from public;
revoke all on function private.is_owner_or_admin() from public;
grant execute on function private.current_company_id() to authenticated, service_role;
grant execute on function private.has_any_role(public.app_role[]) to authenticated, service_role;
grant execute on function private.has_role(public.app_role) to authenticated, service_role;
grant execute on function private.is_staff() to authenticated, service_role;
grant execute on function private.can_edit_ops() to authenticated, service_role;
grant execute on function private.is_owner_or_admin() to authenticated, service_role;

-- updated_at
create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger companies_updated_at before update on public.companies
  for each row execute function private.set_updated_at();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Sign-up: a new auth user becomes a profile. An open invite for the email
-- grants its company and roles; otherwise the profile has no company.
-- ---------------------------------------------------------------------------
create or replace function private.apply_invite(p_profile uuid, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_invite public.staff_invites%rowtype;
begin
  select * into v_invite
  from public.staff_invites
  where lower(email) = lower(p_email) and used_at is null
  order by created_at
  limit 1;
  if not found then
    return;
  end if;

  update public.profiles set company_id = v_invite.company_id where id = p_profile;

  insert into public.profile_roles (profile_id, company_id, role, granted_by)
  select p_profile, v_invite.company_id, r, v_invite.invited_by
  from unnest(v_invite.roles) as r
  on conflict (profile_id, role) do nothing;

  update public.staff_invites
  set used_at = now(), used_by = p_profile
  where id = v_invite.id;
end;
$$;
revoke all on function private.apply_invite(uuid, text) from public;

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  if new.email is not null then
    perform private.apply_invite(new.id, new.email);
  end if;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- An invite created after the person has already signed in applies at once.
create or replace function private.invite_existing_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_profile uuid;
begin
  select id into v_profile from public.profiles
  where lower(email) = lower(new.email)
    and (company_id is null or company_id = new.company_id)
  limit 1;
  if v_profile is not null then
    perform private.apply_invite(v_profile, new.email);
  end if;
  return null;
end;
$$;
revoke all on function private.invite_existing_user() from public;

create trigger staff_invites_apply
  after insert on public.staff_invites
  for each row execute function private.invite_existing_user();

-- A signed-in person may change their own name and picture, nothing else.
create or replace function private.guard_profile_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return new;  -- service role and migrations
  end if;
  if new.company_id is distinct from old.company_id or new.email is distinct from old.email then
    raise exception 'company and email are not editable here';
  end if;
  if new.active is distinct from old.active and not private.is_owner_or_admin() then
    raise exception 'only an owner or admin can change active';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_profile_update() from public;

create trigger profiles_guard before update on public.profiles
  for each row execute function private.guard_profile_update();

-- ---------------------------------------------------------------------------
-- Activity log: append-only, written by triggers (spec: data model, Ledger
-- and events). Every action by a person or the agent lands here.
-- ---------------------------------------------------------------------------
create table public.activity_log (
  id          bigint generated always as identity primary key,
  company_id  uuid not null references public.companies(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  actor_id    uuid,
  actor_kind  text not null check (actor_kind in ('person', 'agent', 'system')),
  action      text not null,
  table_name  text not null,
  row_id      text,
  changes     jsonb
);
create index activity_log_company_time_idx on public.activity_log (company_id, occurred_at desc);
create index activity_log_row_idx on public.activity_log (table_name, row_id);

create or replace function private.log_row_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changes jsonb;
  v_kind text;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, n.value) into v_changes
    from jsonb_each(v_new) n
    where n.key not in ('updated_at') and (v_old -> n.key) is distinct from n.value;
    if v_changes is null then
      return null;  -- nothing but updated_at changed
    end if;
  elsif tg_op = 'INSERT' then
    v_changes := v_new;
  else
    v_changes := v_old;
  end if;

  v_kind := coalesce(nullif(current_setting('app.actor_kind', true), ''),
                     case when auth.uid() is null then 'system' else 'person' end);

  insert into public.activity_log (company_id, actor_id, actor_kind, action, table_name, row_id, changes)
  values (
    (v_row ->> 'company_id')::uuid,
    auth.uid(),
    v_kind,
    lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'job_id', v_row ->> 'org_id', v_row ->> 'profile_id', v_row ->> 'key'),
    v_changes
  );
  return null;
end;
$$;
revoke all on function private.log_row_change() from public;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.companies     enable row level security;
alter table public.settings      enable row level security;
alter table public.profiles      enable row level security;
alter table public.profile_roles enable row level security;
alter table public.staff_invites enable row level security;
alter table public.activity_log  enable row level security;

grant select, update on public.companies to authenticated;
grant select, insert, update, delete on public.settings to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.profile_roles to authenticated;
grant select, insert, delete on public.staff_invites to authenticated;
grant select on public.activity_log to authenticated;
grant all on public.companies, public.settings, public.profiles, public.profile_roles,
  public.staff_invites, public.activity_log to service_role;

-- companies: members read their own company; the owner edits it.
create policy companies_select on public.companies for select to authenticated
  using (id = (select private.current_company_id()));
create policy companies_update on public.companies for update to authenticated
  using (id = (select private.current_company_id()) and (select private.has_role('owner')))
  with check (id = (select private.current_company_id()));

-- settings: staff read; owner and admin write.
create policy settings_select on public.settings for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_staff()));
create policy settings_insert on public.settings for insert to authenticated
  with check (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));
create policy settings_update on public.settings for update to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()))
  with check (company_id = (select private.current_company_id()));
create policy settings_delete on public.settings for delete to authenticated
  using (company_id = (select private.current_company_id()) and (select private.has_role('owner')));

-- profiles: yourself always; staff see their company's people.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid())
         or (company_id = (select private.current_company_id()) and (select private.is_staff())));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())
         or (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin())))
  with check (id = (select auth.uid())
         or (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin())));

-- profile_roles: see your own and (as staff) your company's. The owner grants
-- any role; an admin grants everything except owner and admin.
create policy profile_roles_select on public.profile_roles for select to authenticated
  using (profile_id = (select auth.uid())
         or (company_id = (select private.current_company_id()) and (select private.is_staff())));
create policy profile_roles_insert on public.profile_roles for insert to authenticated
  with check (
    company_id = (select private.current_company_id())
    and exists (select 1 from public.profiles p where p.id = profile_id and p.company_id = profile_roles.company_id)
    and ((select private.has_role('owner'))
         or ((select private.has_role('admin')) and role not in ('owner', 'admin')))
  );
create policy profile_roles_delete on public.profile_roles for delete to authenticated
  using (
    company_id = (select private.current_company_id())
    and ((select private.has_role('owner'))
         or ((select private.has_role('admin')) and role not in ('owner', 'admin')))
  );

-- staff_invites: owner and admin, with the same limit on owner/admin roles.
create policy staff_invites_select on public.staff_invites for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));
create policy staff_invites_insert on public.staff_invites for insert to authenticated
  with check (
    company_id = (select private.current_company_id())
    and ((select private.has_role('owner'))
         or ((select private.has_role('admin')) and not (roles && '{owner,admin}'::public.app_role[])))
  );
create policy staff_invites_delete on public.staff_invites for delete to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));

-- activity_log: staff read; nobody writes except the trigger.
create policy activity_log_select on public.activity_log for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_staff()));

create trigger settings_log after insert or update or delete on public.settings
  for each row execute function private.log_row_change();
create trigger profile_roles_log after insert or delete on public.profile_roles
  for each row execute function private.log_row_change();
create trigger staff_invites_log after insert or delete on public.staff_invites
  for each row execute function private.log_row_change();
