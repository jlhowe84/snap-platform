-- A reply that reaches the desk from the mailbox (someone answered in Gmail
-- or from their own address) means the conversation no longer needs a reply:
-- it waits on the customer. Before, mail out only moved "new" to "open", so
-- answered conversations stayed on the Needs a reply list.
create or replace function private.support_message_added()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.direction = 'note' then
    return new;
  end if;
  update public.support_conversations c set
    first_message_at  = least(coalesce(c.first_message_at, new.sent_at), new.sent_at),
    last_message_at   = greatest(coalesce(c.last_message_at, new.sent_at), new.sent_at),
    last_inbound_at   = case when new.direction = 'in'
                             then greatest(coalesce(c.last_inbound_at, new.sent_at), new.sent_at)
                             else c.last_inbound_at end,
    first_response_at = case when new.direction = 'out' and c.first_response_at is null
                             then new.sent_at else c.first_response_at end,
    status            = case
                          when new.direction = 'in' and c.status in ('closed', 'waiting_customer')
                               and new.sent_at >= coalesce(c.last_message_at, new.sent_at) then 'open'
                          when new.direction = 'out' and c.status in ('new', 'open')
                               and new.sent_at >= coalesce(c.last_message_at, new.sent_at) then 'waiting_customer'
                          else c.status end
  where c.id = new.conversation_id;
  return new;
end;
$$;
revoke all on function private.support_message_added() from public;
