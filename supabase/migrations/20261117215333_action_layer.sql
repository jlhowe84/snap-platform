-- =============================================================================
-- The action layer's tables (spec: The AI core, Architecture and security).
--
-- Every button, every agent step and every outside tool runs an action of a
-- registered type. Each type has a kind and an autonomy level, stored as data
-- and changed only by the owner. The never list is enforced here in the
-- database as well as in code: a never action can only be recorded as blocked
-- or flagged for a person, never approved, sent or executed.
-- =============================================================================

create type public.action_kind as enum ('read', 'draft', 'propose', 'never');
create type public.action_status as enum (
  'proposed', 'approved', 'edited', 'sent', 'executed', 'rejected', 'failed', 'blocked', 'flagged'
);

-- The never list. Code carries the same list (lib/actions/never.ts) and a test
-- checks the two agree. Changing it is a migration, never a setting.
create or replace function private.never_action_keys()
returns text[] language sql immutable set search_path = '' as $$
  select array[
    'money.discount',
    'money.refund',
    'money.move',
    'pricing.change',
    'job.cancel',
    'photo_day.postpone',
    'agreement.contract',
    'support.complaint_reply',
    'booth.guest_message'
  ]
$$;
grant execute on function private.never_action_keys() to authenticated, service_role;

create table public.action_types (
  company_id      uuid not null references public.companies(id) on delete cascade,
  key             text not null check (key ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$'),
  description     text not null,
  kind            public.action_kind not null,
  autonomy_level  smallint not null default 1 check (autonomy_level between 0 and 4),
  clean_streak    int not null default 0,   -- approved with no edits in a row (earned autonomy)
  updated_by      uuid,
  updated_at      timestamptz not null default now(),
  primary key (company_id, key)
);

create or replace function private.guard_action_type()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.kind = 'never' then
      raise exception 'never-list action types cannot be removed';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and (old.kind = 'never' or new.key = any (private.never_action_keys()))
     and new.kind <> 'never' then
    raise exception 'action type % is on the never list and cannot be earned', new.key;
  end if;
  if new.key = any (private.never_action_keys()) then
    new.kind := 'never';
  end if;
  if new.kind = 'never' and new.autonomy_level > 1 then
    raise exception 'never-list action types stay at draft (level 1) or below';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger action_types_guard before insert or update or delete on public.action_types
  for each row execute function private.guard_action_type();

-- The pause switch: a row the runner checks before every send (module 18).
-- action_type_key null pauses everything.
create table public.agent_pauses (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  action_type_key  text,
  reason           text,
  paused_by        uuid references public.profiles(id) on delete set null,
  paused_at        timestamptz not null default now(),
  lifted_by        uuid references public.profiles(id) on delete set null,
  lifted_at        timestamptz
);
create index agent_pauses_open_idx on public.agent_pauses (company_id) where lifted_at is null;

create or replace function public.agent_is_paused(p_company uuid, p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.agent_pauses
    where company_id = p_company and lifted_at is null
      and (action_type_key is null or action_type_key = p_key)
  )
$$;
revoke all on function public.agent_is_paused(uuid, text) from public;
grant execute on function public.agent_is_paused(uuid, text) to authenticated, service_role;

-- Every agent run is logged with inputs, tool calls, cost and outcome.
create table public.agent_runs (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  trigger        text not null,
  model          text,
  status         text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'cancelled')),
  input          jsonb,
  output         jsonb,
  tool_calls     int not null default 0,
  input_tokens   int not null default 0,
  output_tokens  int not null default 0,
  cost_usd       numeric(10, 4) not null default 0,
  error          text,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz
);
create index agent_runs_company_idx on public.agent_runs (company_id, started_at desc);

-- Every action, by a person or the agent: the approval queue and the audit.
create table public.agent_actions (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  run_id           uuid references public.agent_runs(id) on delete set null,
  action_type_key  text not null,
  actor_kind       text not null check (actor_kind in ('person', 'agent', 'system')),
  actor_id         uuid references public.profiles(id) on delete set null,
  status           public.action_status not null,
  input            jsonb,
  draft            jsonb,
  result           jsonb,
  record_refs      jsonb,   -- the records behind a draft, so a person can check it in one click
  error            text,
  decided_by       uuid references public.profiles(id) on delete set null,
  decided_at       timestamptz,
  decision_note    text,
  created_at       timestamptz not null default now(),
  foreign key (company_id, action_type_key) references public.action_types (company_id, key)
);
create index agent_actions_queue_idx on public.agent_actions (company_id, status, created_at desc);

create or replace function private.guard_agent_action()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_kind public.action_kind;
begin
  select kind into v_kind from public.action_types
  where company_id = new.company_id and key = new.action_type_key;

  if v_kind = 'never' and new.status not in ('blocked', 'flagged') then
    raise exception 'action % is on the never list: it can only be blocked or flagged for a person',
      new.action_type_key;
  end if;

  if new.actor_kind = 'agent' and new.status in ('sent', 'executed')
     and public.agent_is_paused(new.company_id, new.action_type_key) then
    raise exception 'the agent is paused for %', new.action_type_key;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_agent_action() from public;

create trigger agent_actions_guard before insert or update on public.agent_actions
  for each row execute function private.guard_agent_action();

-- Integration health (module 18): last success, next run, reconnect.
-- Decision 7: SNAP-only connections sit behind `enabled`.
create table public.integration_status (
  company_id       uuid not null references public.companies(id) on delete cascade,
  integration      text not null check (integration ~ '^[a-z0-9_]+$'),
  enabled          boolean not null default false,
  last_success_at  timestamptz,
  last_error_at    timestamptz,
  last_error       text,
  next_run_at      timestamptz,
  details          jsonb,
  updated_at       timestamptz not null default now(),
  primary key (company_id, integration)
);

-- Integration secrets live in Supabase Vault (decision 5: keys encrypted,
-- never in the repo). This table only maps a company and integration to a
-- Vault secret id, and sits in the private schema the Data API never exposes.
create table private.integration_secrets (
  company_id       uuid not null references public.companies(id) on delete cascade,
  integration      text not null,
  vault_secret_id  uuid not null,
  updated_at       timestamptz not null default now(),
  primary key (company_id, integration)
);
alter table private.integration_secrets enable row level security;
revoke all on private.integration_secrets from public, authenticated;

-- Set from the Supabase SQL editor by the owner, never through the app:
--   select private.set_integration_secret('<company id>', 'captura', '{"account_id": "...", ...}');
create or replace function private.set_integration_secret(p_company uuid, p_integration text, p_secret text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  select vault_secret_id into v_id from private.integration_secrets
  where company_id = p_company and integration = p_integration;
  if v_id is null then
    v_id := vault.create_secret(p_secret, p_company::text || ':' || p_integration);
    insert into private.integration_secrets (company_id, integration, vault_secret_id)
    values (p_company, p_integration, v_id);
  else
    perform vault.update_secret(v_id, p_secret);
    update private.integration_secrets set updated_at = now()
    where company_id = p_company and integration = p_integration;
  end if;
end;
$$;
revoke all on function private.set_integration_secret(uuid, text, text) from public, authenticated;

-- Read by server code through the service role only.
create or replace function public.integration_secret(p_company uuid, p_integration text)
returns text language sql stable security definer set search_path = '' as $$
  select d.decrypted_secret
  from private.integration_secrets s
  join vault.decrypted_secrets d on d.id = s.vault_secret_id
  where s.company_id = p_company and s.integration = p_integration
$$;
revoke all on function public.integration_secret(uuid, text) from public, anon, authenticated;
grant execute on function public.integration_secret(uuid, text) to service_role;

create trigger integration_status_updated_at before update on public.integration_status
  for each row execute function private.set_updated_at();
create trigger action_types_log after insert or update on public.action_types
  for each row execute function private.log_row_change();
create trigger agent_pauses_log after insert or update on public.agent_pauses
  for each row execute function private.log_row_change();
create trigger agent_actions_log after insert or update on public.agent_actions
  for each row execute function private.log_row_change();

-- RLS ------------------------------------------------------------------------
alter table public.action_types enable row level security;
alter table public.agent_pauses enable row level security;
alter table public.agent_runs enable row level security;
alter table public.agent_actions enable row level security;
alter table public.integration_status enable row level security;

grant select, insert, update on public.action_types to authenticated;
grant select, insert, update on public.agent_pauses to authenticated;
grant select on public.agent_runs to authenticated;
grant select, insert, update on public.agent_actions to authenticated;
grant select, insert, update on public.integration_status to authenticated;
grant all on public.action_types, public.agent_pauses, public.agent_runs, public.agent_actions,
  public.integration_status to service_role;

-- Autonomy levels and the never list: staff read, only the owner changes.
create policy action_types_select on public.action_types for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_staff()));
create policy action_types_insert on public.action_types for insert to authenticated
  with check (company_id = (select private.current_company_id()) and (select private.has_role('owner')));
create policy action_types_update on public.action_types for update to authenticated
  using (company_id = (select private.current_company_id()) and (select private.has_role('owner')))
  with check (company_id = (select private.current_company_id()));

-- Pause: owner and admin (admins may pause, spec roles table).
create policy agent_pauses_select on public.agent_pauses for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_staff()));
create policy agent_pauses_insert on public.agent_pauses for insert to authenticated
  with check (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));
create policy agent_pauses_update on public.agent_pauses for update to authenticated
  using (company_id = (select private.current_company_id()) and (select private.has_role('owner')))
  with check (company_id = (select private.current_company_id()));

-- Agent runs and cost: owner and admin read; written by the server only.
create policy agent_runs_select on public.agent_runs for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));

-- Actions: staff read the queue. A person records their own actions; staff
-- decide queued ones. The never-list trigger applies to everyone.
create policy agent_actions_select on public.agent_actions for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_staff()));
create policy agent_actions_insert on public.agent_actions for insert to authenticated
  with check (company_id = (select private.current_company_id()) and (select private.is_staff())
              and actor_kind = 'person' and actor_id = (select auth.uid()));
create policy agent_actions_update on public.agent_actions for update to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_staff()))
  with check (company_id = (select private.current_company_id()));

create policy integration_status_select on public.integration_status for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_staff()));
create policy integration_status_insert on public.integration_status for insert to authenticated
  with check (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));
create policy integration_status_update on public.integration_status for update to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()))
  with check (company_id = (select private.current_company_id()));

-- ---------------------------------------------------------------------------
-- Company defaults: the action types every company starts with, the settings
-- the spec names, and the integration rows. Values are SNAP's starting points
-- from the spec; each is a setting the owner can change later.
-- ---------------------------------------------------------------------------
create or replace function private.seed_company_defaults(p_company uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.action_types (company_id, key, description, kind, autonomy_level) values
    (p_company, 'leagues.read',        'Search and read leagues, contacts and terms', 'read', 4),
    (p_company, 'jobs.read',           'Search and read jobs and photo days', 'read', 4),
    (p_company, 'captura.read',        'Read galleries, subjects and orders from Captura', 'read', 4),
    (p_company, 'leagues.update',      'Change a league''s details or terms', 'propose', 1),
    (p_company, 'jobs.update',         'Change a job''s details', 'propose', 1),
    (p_company, 'jobs.set_status',     'Change a job''s status or stage', 'propose', 1),
    (p_company, 'tasks.complete',      'Tick a task', 'propose', 1),
    (p_company, 'messages.draft',      'Draft an email or portal message', 'draft', 1),
    (p_company, 'messages.send',       'Send a message to a customer or league', 'propose', 1),
    (p_company, 'settings.update',     'Change a setting', 'propose', 0),
    (p_company, 'money.discount',      'Offer or apply a discount', 'never', 1),
    (p_company, 'money.refund',        'Refund an order', 'never', 1),
    (p_company, 'money.move',          'Anything that moves money', 'never', 1),
    (p_company, 'pricing.change',      'Change prices or packages', 'never', 1),
    (p_company, 'job.cancel',          'Cancel a job', 'never', 1),
    (p_company, 'photo_day.postpone',  'Postpone or reschedule a photo day', 'never', 1),
    (p_company, 'agreement.contract',  'Change or sign a contract or agreement', 'never', 1),
    (p_company, 'support.complaint_reply', 'Reply to a complaint', 'never', 1),
    (p_company, 'booth.guest_message', 'Send anything to booth or event guests', 'never', 1)
  on conflict (company_id, key) do nothing;

  insert into public.settings (company_id, key, value) values
    (p_company, 'mail.test_mode',            'true'::jsonb),
    (p_company, 'mail.test_recipient',       'null'::jsonb),
    (p_company, 'signin.allowed_domains',    '[]'::jsonb),
    (p_company, 'capacity.stations_per_date','10'::jsonb),
    (p_company, 'holds.days_top_tier',       '21'::jsonb),
    (p_company, 'holds.days_other',          '14'::jsonb),
    (p_company, 'agent.monthly_budget_usd',  'null'::jsonb),
    (p_company, 'brand.name',                'null'::jsonb),
    (p_company, 'brand.primary_color',       '"#F0803F"'::jsonb)
  on conflict (company_id, key) do nothing;

  insert into public.integration_status (company_id, integration, enabled) values
    (p_company, 'gmail', false),
    (p_company, 'captura', false),
    (p_company, 'google_calendar', false),
    (p_company, 'google_drive', false),
    (p_company, 'notion_import', true),
    (p_company, 'check_cherry', false),
    (p_company, 'quickbooks', false),
    (p_company, 'imac_helper', false),
    (p_company, 'snapshield', false)
  on conflict (company_id, integration) do nothing;
end;
$$;
revoke all on function private.seed_company_defaults(uuid) from public, authenticated;
