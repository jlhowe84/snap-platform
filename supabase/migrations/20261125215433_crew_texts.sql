-- =============================================================================
-- Crew text messages: consent and a log. Nothing is sent from here.
--
-- SNAP Photo has no approved text registration of its own yet (the one
-- approved 7/31 belongs to Snap Party Booths), so this lays the ground:
--
--   sms_consents   one row per opt-in or opt-out, never edited, so the record
--                  of who agreed to what, and when, stays whole. The newest
--                  row for a crew member is their current answer.
--   text_messages  every crew text the platform would send. While sms.enabled
--                  is false a text is only logged; the sender added later
--                  marks it sent or failed.
--
-- Crew opt in or out of their own texts only, through two functions keyed on
-- the signed-in crew member. The office reads both tables; nobody writes them
-- directly. A text is logged only for someone whose newest answer is yes.
-- =============================================================================

create table public.sms_consents (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  crew_member_id   uuid not null references public.crew_members(id) on delete cascade,
  phone            text check (phone ~ '^\+1[2-9][0-9]{9}$'),
  opted_in         boolean not null,
  source           text not null check (source in ('crew_page', 'reply_stop', 'reply_start')),
  wording_version  text not null check (length(wording_version) between 1 and 40),
  created_by       uuid references public.profiles(id) on delete set null,
  -- clock time, not transaction time, so two answers in one transaction still
  -- come in order
  created_at       timestamptz not null default clock_timestamp(),
  check (not opted_in or phone is not null)
);
create index sms_consents_member_idx on public.sms_consents (crew_member_id, created_at desc);

create table public.text_messages (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  crew_member_id   uuid references public.crew_members(id) on delete set null,
  to_phone         text not null check (to_phone ~ '^\+1[2-9][0-9]{9}$'),
  kind             text not null check (kind in ('crew.added', 'crew.removed', 'crew.day_before', 'crew.offer')),
  body             text not null check (length(body) between 1 and 480),
  status           text not null default 'logged' check (status in ('logged', 'sent', 'failed')),
  note             text,
  provider_id      text,
  agent_action_id  uuid references public.agent_actions(id) on delete set null,
  created_at       timestamptz not null default now(),
  sent_at          timestamptz
);
create index text_messages_company_idx on public.text_messages (company_id, created_at desc);

alter table public.sms_consents enable row level security;
alter table public.text_messages enable row level security;
grant select on public.sms_consents, public.text_messages to authenticated;
grant all on public.sms_consents, public.text_messages to service_role;

create policy sms_consents_select on public.sms_consents for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()));
create policy text_messages_select on public.text_messages for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()));

-- The phone a crew member said yes to, or null when their newest answer is no
-- or they never answered.
create or replace function private.crew_text_phone(p_crew_member_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case when s.opted_in then s.phone end
  from public.sms_consents s
  where s.crew_member_id = p_crew_member_id
  order by s.created_at desc, s.id desc
  limit 1
$$;
revoke all on function private.crew_text_phone(uuid) from public;
grant execute on function private.crew_text_phone(uuid) to authenticated, service_role;

create or replace function public.my_text_consent()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('opted_in', s.opted_in, 'phone', s.phone, 'at', s.created_at)
  from public.sms_consents s
  where s.crew_member_id = private.my_crew_member_id()
  order by s.created_at desc, s.id desc
  limit 1
$$;
revoke all on function public.my_text_consent() from public, anon;
grant execute on function public.my_text_consent() to authenticated;

create or replace function public.set_my_text_consent(p_opt_in boolean, p_phone text, p_wording_version text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_id      uuid := private.my_crew_member_id();
  v_company uuid;
  v_phone   text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  if v_id is null then
    raise exception 'only a crew member can answer for their own texts' using errcode = '42501';
  end if;
  if p_opt_in is null then
    raise exception 'say yes or no';
  end if;
  if p_opt_in and (v_phone is null or v_phone !~ '^\+1[2-9][0-9]{9}$') then
    raise exception 'a US mobile number is needed to opt in';
  end if;
  select company_id into v_company from public.crew_members where id = v_id;
  insert into public.sms_consents (company_id, crew_member_id, phone, opted_in, source, wording_version, created_by)
  values (v_company, v_id, case when p_opt_in then v_phone end, p_opt_in, 'crew_page', p_wording_version, auth.uid());
end;
$$;
revoke all on function public.set_my_text_consent(boolean, text, text) from public, anon;
grant execute on function public.set_my_text_consent(boolean, text, text) to authenticated;

-- Log a crew text for someone on the staff desk (it runs when the office
-- sends a crew notice). Returns the new row's id, or null when the crew member
-- has not said yes to texts.
create or replace function public.log_crew_text(p_crew_member_id uuid, p_kind text, p_body text, p_agent_action_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid;
  v_phone   text;
  v_id      uuid;
begin
  if not private.is_staff() then
    raise exception 'only the staff desk logs crew texts' using errcode = '42501';
  end if;
  select company_id into v_company from public.crew_members
  where id = p_crew_member_id and company_id = private.current_company_id();
  if v_company is null then
    raise exception 'that crew member was not found';
  end if;
  v_phone := private.crew_text_phone(p_crew_member_id);
  if v_phone is null then
    return null;
  end if;
  insert into public.text_messages (company_id, crew_member_id, to_phone, kind, body, agent_action_id)
  values (v_company, p_crew_member_id, v_phone, p_kind, p_body,
          (select a.id from public.agent_actions a where a.id = p_agent_action_id and a.company_id = v_company))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.log_crew_text(uuid, text, text, uuid) from public, anon;
grant execute on function public.log_crew_text(uuid, text, text, uuid) to authenticated;

-- Texts stay off until the owner switches them on; test mode sends to one number.
insert into public.settings (company_id, key, value)
select c.id, s.key, s.value
from public.companies c
cross join (values ('sms.enabled', 'false'::jsonb), ('sms.test_mode', 'true'::jsonb), ('sms.test_recipient', 'null'::jsonb)) as s(key, value)
on conflict (company_id, key) do nothing;
