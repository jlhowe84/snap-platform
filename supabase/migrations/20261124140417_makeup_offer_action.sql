-- The makeup offer for a prepay order with no photos waits in the approval
-- queue like every other message; a person approves each one.
insert into public.action_types (company_id, key, description, kind, autonomy_level)
select c.id, 'prepay.makeup_offer', 'Offer a makeup session to a parent whose prepay order has no photos', 'propose', 1
from public.companies c
on conflict (company_id, key) do nothing;
