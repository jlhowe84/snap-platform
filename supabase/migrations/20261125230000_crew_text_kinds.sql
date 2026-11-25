-- =============================================================================
-- Crew texts, part two: each text can carry a key so a reminder or an offer
-- is logged once however often the job that makes it runs, and the staff desk
-- can log offer texts. A STOP or START reply arrives from the carrier through
-- the server (service role), which records it as a new answer.
-- =============================================================================

alter table public.text_messages add column ref_key text check (length(ref_key) <= 200);
create unique index text_messages_ref_key_idx on public.text_messages (company_id, kind, crew_member_id, ref_key) where ref_key is not null;

drop function public.log_crew_text(uuid, text, text, uuid);

-- Log a crew text for someone on the staff desk. Returns the new row's id, or
-- null when the crew member has not said yes to texts or a text with the same
-- key was logged before.
create or replace function public.log_crew_text(p_crew_member_id uuid, p_kind text, p_body text, p_agent_action_id uuid, p_ref_key text default null)
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
  insert into public.text_messages (company_id, crew_member_id, to_phone, kind, body, agent_action_id, ref_key)
  values (v_company, p_crew_member_id, v_phone, p_kind, p_body,
          (select a.id from public.agent_actions a where a.id = p_agent_action_id and a.company_id = v_company),
          p_ref_key)
  on conflict (company_id, kind, crew_member_id, ref_key) where ref_key is not null do nothing
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.log_crew_text(uuid, text, text, uuid, text) from public, anon;
grant execute on function public.log_crew_text(uuid, text, text, uuid, text) to authenticated;

-- A logged text that is not sent (too old by the time texts were switched on,
-- or the crew member said no in between) is marked skipped, with the reason.
alter table public.text_messages drop constraint text_messages_status_check;
alter table public.text_messages add constraint text_messages_status_check check (status in ('logged', 'sent', 'failed', 'skipped'));
