-- =============================================================================
-- Support desk: quiet rules. Like quiet senders, but for an address that also
-- writes real mail: its messages are left out only when the subject holds
-- some text (a lab's invoice emails, say). The list is the company setting
-- support.quiet_rules, an array of { from, subject }.
--
-- This clears conversations stored before a rule was added: only untouched
-- ones (still new, unassigned, no notes) whose subject holds the text and
-- whose every message came from that sender. Service role only.
-- =============================================================================

create or replace function public.support_drop_quiet_rules(p_company uuid, p_rules jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  if auth.uid() is not null then
    raise exception 'mail is stored by the server only';
  end if;
  if p_rules is null or jsonb_typeof(p_rules) <> 'array' then
    return 0;
  end if;

  with rules as (
    select lower(trim(r->>'from')) as sender, lower(trim(r->>'subject')) as subject
    from jsonb_array_elements(p_rules) r
    where trim(coalesce(r->>'from', '')) like '%_@_%' and length(trim(coalesce(r->>'subject', ''))) >= 3
  ),
  gone as (
    delete from public.support_conversations c
    using rules
    where c.company_id = p_company
      and c.status = 'new'
      and c.assignee_id is null
      and position(rules.subject in lower(c.subject)) > 0
      and exists (select 1 from public.support_messages m where m.conversation_id = c.id)
      and not exists (
        select 1 from public.support_messages m
        where m.conversation_id = c.id
          and (m.direction = 'note' or m.from_address is distinct from rules.sender)
      )
    returning 1
  )
  select count(*) into v_count from gone;
  return v_count;
end;
$$;

revoke all on function public.support_drop_quiet_rules(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.support_drop_quiet_rules(uuid, jsonb) to service_role;
