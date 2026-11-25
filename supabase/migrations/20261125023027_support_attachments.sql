-- =============================================================================
-- Support desk: attachments on mail.
--
-- The files themselves stay in the mailbox. Each stored message keeps a list
-- of what came with it: [{ part, name, type, size, inline }], where `part` is
-- the mailbox's own part number, used to fetch the file when someone opens
-- it. Null means the message has not been looked at for attachments yet
-- (mail stored before this change); the sync fills those in a few at a time.
-- =============================================================================

alter table public.support_messages add column attachments jsonb;

alter table public.support_messages add constraint support_messages_attachments_shape
  check (attachments is null or jsonb_typeof(attachments) = 'array');
-- A note is typed by a person and carries no files.
alter table public.support_messages add constraint support_messages_note_no_files
  check (direction <> 'note' or attachments is null);

create index support_messages_unchecked_idx on public.support_messages (company_id, sent_at desc)
  where attachments is null and gmail_message_id is not null;

-- p_items is [{ id: <mailbox message id>, attachments: [...] }]. Server only.
create or replace function public.support_set_attachments(p_company uuid, p_items jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  if auth.uid() is not null then
    raise exception 'mail is stored by the server only';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return 0;
  end if;
  with items as (
    select e->>'id' as id, coalesce(e->'attachments', '[]'::jsonb) as files
    from jsonb_array_elements(p_items) e
    where e->>'id' is not null and jsonb_typeof(coalesce(e->'attachments', '[]'::jsonb)) = 'array'
  ),
  done as (
    update public.support_messages m set attachments = items.files
    from items
    where m.company_id = p_company and m.gmail_message_id = items.id
      and m.attachments is distinct from items.files
    returning 1
  )
  select count(*) into v_count from done;
  return v_count;
end;
$$;

revoke all on function public.support_set_attachments(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.support_set_attachments(uuid, jsonb) to service_role;
