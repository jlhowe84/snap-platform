-- The day-before reminder to the parent. parent_reminded_on is the day it
-- went out (once per booking time; a move clears it). The reminder carries
-- its own link to the booking, kept apart from the confirmation's link so
-- the one the parent already holds keeps working. Only the hash is stored.
alter table public.makeup_bookings
  add column parent_reminded_on date,
  add column reminder_token_hash text unique;
