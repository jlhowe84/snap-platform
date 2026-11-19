-- Sending an approved draft. The server (service role) sends through Gmail
-- after a person approves; these two functions make the send happen once and
-- leave a record on the action. Mail still passes lib/mail/guard.ts, so in
-- test mode every message goes to the test recipient only.

-- Claims an approved action for sending. Refuses a paused action type, an
-- action nobody approved, one already sent, and one another request claimed
-- in the last two minutes.
create or replace function public.action_send_begin(p_company uuid, p_action uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.agent_actions%rowtype;
begin
  if auth.uid() is not null then
    raise exception 'sending runs from the server only';
  end if;
  select * into v from public.agent_actions
  where id = p_action and company_id = p_company
  for update;
  if not found then
    raise exception 'action not found';
  end if;
  if v.status = 'sent' then
    raise exception 'this message was already sent';
  end if;
  if v.status not in ('approved', 'edited', 'failed') or v.decided_by is null then
    raise exception 'only an approved draft can be sent';
  end if;
  if public.agent_is_paused(v.company_id, v.action_type_key) then
    raise exception 'sending is paused';
  end if;
  if (v.result ->> 'send_started_at')::timestamptz > now() - interval '2 minutes' then
    raise exception 'this message is already being sent';
  end if;

  update public.agent_actions
  set result = coalesce(result, '{}'::jsonb) || jsonb_build_object('send_started_at', now()),
      error = null
  where id = p_action;

  return jsonb_build_object('action_type_key', v.action_type_key, 'draft', v.draft,
    'record_refs', v.record_refs, 'decided_by', v.decided_by);
end;
$$;
revoke all on function public.action_send_begin(uuid, uuid) from public, anon, authenticated;
grant execute on function public.action_send_begin(uuid, uuid) to service_role;

-- Records how the send ended. A failed send can be tried again.
create or replace function public.action_send_finish(
  p_company uuid,
  p_action  uuid,
  p_ok      boolean,
  p_result  jsonb default null,
  p_error   text default null
)
returns public.action_status
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.action_status := case when p_ok then 'sent' else 'failed' end;
begin
  if auth.uid() is not null then
    raise exception 'sending runs from the server only';
  end if;
  update public.agent_actions
  set status = v_status,
      result = (coalesce(result, '{}'::jsonb) - 'send_started_at') || coalesce(p_result, '{}'::jsonb),
      error = case when p_ok then null else left(coalesce(p_error, 'The message could not be sent.'), 500) end
  where id = p_action and company_id = p_company
    and status in ('approved', 'edited', 'failed') and result ? 'send_started_at';
  if not found then
    raise exception 'this send was not started';
  end if;
  return v_status;
end;
$$;
revoke all on function public.action_send_finish(uuid, uuid, boolean, jsonb, text) from public, anon, authenticated;
grant execute on function public.action_send_finish(uuid, uuid, boolean, jsonb, text) to service_role;
