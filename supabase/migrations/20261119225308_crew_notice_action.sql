-- Crew shift notices wait in the approval queue like every other message.
insert into public.action_types (company_id, key, description, kind, autonomy_level)
select c.id, 'crew.notify', 'Tell a crew member they were put on or taken off a shift', 'propose', 1
from public.companies c
on conflict (company_id, key) do nothing;
