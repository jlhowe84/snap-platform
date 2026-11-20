-- Crew profiles (owner's ask, 2026-11-20): one page per crew member holding
-- their contact details, photo, home address, emergency contact and pay.
--
--   * crew_homes becomes crew_private: home address and emergency contact.
--     Owner and admin only, never in the activity log.
--   * crew_members.photo_path points at a picture in the private crew-photos
--     bucket. The server hands staff short signed links after an RLS read.

alter table public.crew_homes rename to crew_private;
alter table public.crew_private alter column address drop not null;
alter table public.crew_private drop constraint if exists crew_homes_address_check;
alter table public.crew_private add constraint crew_private_address_check
  check (address is null or length(trim(address)) between 5 and 300);
alter table public.crew_private
  add column emergency_name  text check (emergency_name is null or length(emergency_name) <= 120),
  add column emergency_phone text check (emergency_phone is null or length(emergency_phone) <= 40);
alter index public.crew_homes_company_idx rename to crew_private_company_idx;

alter table public.crew_members add column photo_path text
  check (photo_path is null or photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]+$');

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('crew-photos', 'crew-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
    on conflict (id) do nothing;
  end if;
end;
$$;
