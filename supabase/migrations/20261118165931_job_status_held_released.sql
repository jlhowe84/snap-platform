-- New job states for Wave A booking. Kept apart from the booking migration:
-- a new enum value cannot be used in the transaction that adds it.
--   held      a date offered and held, not yet confirmed by signing
--   released  a hold that lapsed or was let go (after cancelled)
alter type public.job_status add value if not exists 'held' before 'planning';
alter type public.job_status add value if not exists 'released' after 'cancelled';
