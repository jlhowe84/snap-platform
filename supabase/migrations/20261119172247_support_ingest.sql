-- =============================================================================
-- Support desk: how mail enters. The server reads a thread from an allowed
-- mailbox and hands it here in one call, so a thread and its messages land
-- together or not at all. Service role only.
--
-- p_messages is an array of
--   { id, direction ('in' | 'out'), from_address, from_name, to, cc, body, sent_at }
-- A thread with no mail from outside never becomes a conversation, so the
-- platform's own sends to leagues stay out of the queue until someone answers.
-- Calling it again with the same thread adds only the messages not yet stored.
-- =============================================================================

create or replace function public.support_ingest(
  p_company   uuid,
  p_mailbox   text,
  p_thread_id text,
  p_subject   text,
  p_messages  jsonb
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_conv   uuid;
  v_new    boolean := false;
  v_first  jsonb;
  v_email  text;
  v_org    uuid;
  v_added  integer := 0;
  v_rows   integer;
  m        jsonb;
begin
  if auth.uid() is not null then
    raise exception 'mail is stored by the server only';
  end if;
  if p_messages is null or jsonb_typeof(p_messages) <> 'array' then
    raise exception 'messages must be an array';
  end if;
  if coalesce(trim(p_thread_id), '') = '' or coalesce(trim(p_mailbox), '') = '' then
    raise exception 'a thread needs its mailbox and id';
  end if;

  select id into v_conv from public.support_conversations
  where company_id = p_company and mailbox = lower(p_mailbox) and gmail_thread_id = p_thread_id
  for update;

  if v_conv is null then
    select e into v_first
    from jsonb_array_elements(p_messages) e
    where e->>'direction' = 'in'
    order by (e->>'sent_at')::timestamptz
    limit 1;
    if v_first is null then
      return jsonb_build_object('conversation_id', null, 'created', false, 'added', 0);
    end if;

    v_email := lower(nullif(trim(v_first->>'from_address'), ''));

    -- The league, when the sender is a contact of exactly one.
    if v_email is not null then
      select min(oc.org_id::text)::uuid into v_org
      from public.contacts c
      join public.organization_contacts oc on oc.contact_id = c.id and oc.company_id = c.company_id
      where c.company_id = p_company and v_email = any (private.email_addresses(c.email))
      having count(distinct oc.org_id) = 1;
    end if;

    insert into public.support_conversations
      (company_id, mailbox, gmail_thread_id, subject, customer_email, customer_name, organization_id)
    values
      (p_company, lower(p_mailbox), p_thread_id,
       coalesce(nullif(left(trim(p_subject), 300), ''), '(no subject)'),
       v_email, nullif(left(trim(v_first->>'from_name'), 200), ''), v_org)
    returning id into v_conv;
    v_new := true;
  end if;

  for m in
    select e from jsonb_array_elements(p_messages) e
    where e->>'direction' in ('in', 'out') and coalesce(e->>'id', '') <> ''
    order by (e->>'sent_at')::timestamptz
  loop
    insert into public.support_messages
      (company_id, conversation_id, direction, gmail_message_id, from_address, from_name,
       to_addresses, cc_addresses, body_text, sent_at)
    values
      (p_company, v_conv, m->>'direction', m->>'id',
       lower(nullif(trim(m->>'from_address'), '')), nullif(left(trim(m->>'from_name'), 200), ''),
       coalesce((select array_agg(lower(x)) from jsonb_array_elements_text(coalesce(m->'to', '[]'::jsonb)) x), '{}'),
       coalesce((select array_agg(lower(x)) from jsonb_array_elements_text(coalesce(m->'cc', '[]'::jsonb)) x), '{}'),
       left(coalesce(m->>'body', ''), 100000), (m->>'sent_at')::timestamptz)
    on conflict (company_id, gmail_message_id) do nothing;
    get diagnostics v_rows = row_count;
    v_added := v_added + v_rows;
  end loop;

  return jsonb_build_object('conversation_id', v_conv, 'created', v_new, 'added', v_added);
end;
$$;

revoke all on function public.support_ingest(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.support_ingest(uuid, text, text, text, jsonb) to service_role;

-- Where the sync left off, written by the server. A run reads the mailbox one
-- day at a time, oldest first, and records each finished day here, so a run
-- that stops early picks up where it stopped.
create or replace function public.support_sync_mark(
  p_company uuid,
  p_mailbox text,
  p_through timestamptz default null,
  p_error   text default null
)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    raise exception 'mail is stored by the server only';
  end if;
  insert into public.support_sync_state (company_id, mailbox, last_synced_at, last_error)
  values (p_company, lower(p_mailbox), p_through, left(p_error, 500))
  on conflict (company_id, mailbox) do update
    set last_synced_at = coalesce(greatest(excluded.last_synced_at, public.support_sync_state.last_synced_at),
                                  public.support_sync_state.last_synced_at),
        last_error = excluded.last_error;
end;
$$;

revoke all on function public.support_sync_mark(uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.support_sync_mark(uuid, text, timestamptz, text) to service_role;
