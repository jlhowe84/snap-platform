-- The one company the end-to-end tests run as. Loaded before the migrations so
-- the settings they seed per company exist. Test data only, never hosted.
insert into public.companies (id, slug, name, time_zone)
values ('e2e00000-0000-4000-8000-000000000001', 'e2e-photo', 'E2E Photo', 'America/New_York');
