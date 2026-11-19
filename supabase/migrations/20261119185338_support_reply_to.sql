-- =============================================================================
-- Support desk: mail from a website form. The form is sent from the site's
-- own address with the person's address as Reply-To, and the server now reads
-- the person as the writer. Reading a thread again corrects what was stored
-- before: an inbound message's writer and text, and the conversation's customer when
-- the message that opened it now names someone else. Nothing else changes.
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
  v_was    text;
  v_fresh  boolean;
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

  select e into v_first
  from jsonb_array_elements(p_messages) e
  where e->>'direction' = 'in'
  order by (e->>'sent_at')::timestamptz
  limit 1;
  v_email := lower(nullif(trim(v_first->>'from_address'), ''));

  if v_conv is not null and v_email is not null then
    -- The thread was stored before its first writer was read correctly: when
    -- the message that opened the conversation now names someone else, the
    -- conversation follows it.
    select m0.from_address into v_was
    from public.support_messages m0
    where m0.conversation_id = v_conv and m0.direction = 'in' and m0.gmail_message_id = v_first->>'id'
      and m0.sent_at = (select min(m1.sent_at) from public.support_messages m1
                        where m1.conversation_id = v_conv and m1.direction = 'in');
    if v_was is not null and v_was is distinct from v_email then
      select min(oc.org_id::text)::uuid into v_org
      from public.contacts c
      join public.organization_contacts oc on oc.contact_id = c.id and oc.company_id = c.company_id
      where c.company_id = p_company and v_email = any (private.email_addresses(c.email))
      having count(distinct oc.org_id) = 1;
      update public.support_conversations set
        customer_email = v_email,
        customer_name = nullif(left(trim(v_first->>'from_name'), 200), ''),
        organization_id = coalesce(organization_id, v_org)
      where id = v_conv;
    end if;
  end if;

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
    on conflict (company_id, gmail_message_id) do update
      set from_address = excluded.from_address, from_name = excluded.from_name, body_text = excluded.body_text
      where public.support_messages.direction = 'in'
        and (public.support_messages.from_address, public.support_messages.from_name, public.support_messages.body_text)
            is distinct from (excluded.from_address, excluded.from_name, excluded.body_text)
    returning (xmax = 0) into v_fresh;
    if v_fresh then v_added := v_added + 1; end if;
    v_fresh := null;
  end loop;

  return jsonb_build_object('conversation_id', v_conv, 'created', v_new, 'added', v_added);
end;
$$;


revoke all on function public.support_ingest(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.support_ingest(uuid, text, text, text, jsonb) to service_role;
