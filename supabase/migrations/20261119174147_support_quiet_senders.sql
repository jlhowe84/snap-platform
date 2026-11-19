-- =============================================================================
-- Support desk: quiet senders. Some addresses only send automatic notices
-- (an order receipt after every order). The sync leaves their mail out, so a
-- thread shows up only once a person answers it. The list is the company
-- setting support.quiet_senders.
--
-- This clears conversations stored before a sender was listed: only ones
-- nobody has touched (still new, unassigned, no notes) and whose every
-- message came from a quiet sender. Service role only.
-- =============================================================================

create or replace function public.support_drop_quiet(p_company uuid, p_senders text[])
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_senders text[];
  v_count   integer;
begin
  if auth.uid() is not null then
    raise exception 'mail is stored by the server only';
  end if;
  select coalesce(array_agg(lower(trim(s))), '{}') into v_senders
  from unnest(coalesce(p_senders, '{}'::text[])) s
  where trim(s) like '%_@_%';
  if cardinality(v_senders) = 0 then
    return 0;
  end if;

  with gone as (
    delete from public.support_conversations c
    where c.company_id = p_company
      and c.status = 'new'
      and c.assignee_id is null
      and exists (select 1 from public.support_messages m where m.conversation_id = c.id)
      and not exists (
        select 1 from public.support_messages m
        where m.conversation_id = c.id
          and (m.direction = 'note' or m.from_address is null or not (m.from_address = any (v_senders)))
      )
    returning 1
  )
  select count(*) into v_count from gone;
  return v_count;
end;
$$;

revoke all on function public.support_drop_quiet(uuid, text[]) from public, anon, authenticated;
grant execute on function public.support_drop_quiet(uuid, text[]) to service_role;
