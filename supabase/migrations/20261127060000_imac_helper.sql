-- =============================================================================
-- The production iMac helper (spec Wave C). A small script on the iMac makes
-- each job's PHOTO IMPORT folder and Capture One session when the job starts
-- production (taking over job-folders.py), and reports back what it sees:
-- folder names, image counts and whether the session and the NAS copy exist.
-- Never image files, file names or passwords.
--
--   helper_devices        one row per connected computer. Only a hash of its
--                         key is stored; the key is shown once to the owner.
--   jobs.nas_folder       the job's folder name when it differs from
--                         "YY <Job name>" (folders made by hand). The helper
--                         records the name it made or found.
--   job_folder_evidence   the latest report for each job, with the day the
--                         import and the NAS upload first looked done.
--
-- Devices: owner and admin. Evidence: read by the office roles; written only
-- by the server when a helper reports.
-- =============================================================================

create table public.helper_devices (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 100),
  token_hash    text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  last_version  text check (char_length(last_version) <= 40),
  -- {photo_import: bool, nas: bool, created: int, jobs: int, problem?: text}
  last_report   jsonb,
  revoked_at    timestamptz
);
create index helper_devices_company_idx on public.helper_devices (company_id);
create index helper_devices_created_by_idx on public.helper_devices (created_by);

alter table public.helper_devices enable row level security;
grant select, insert, update on public.helper_devices to authenticated;
grant all on public.helper_devices to service_role;
create policy helper_devices_select on public.helper_devices for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));
create policy helper_devices_insert on public.helper_devices for insert to authenticated
  with check (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));
create policy helper_devices_update on public.helper_devices for update to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()))
  with check (company_id = (select private.current_company_id()));

alter table public.jobs
  add column nas_folder text check (nas_folder is null or (length(btrim(nas_folder)) between 1 and 200 and nas_folder !~ '[/:]' and nas_folder !~ '^\.'));

create table public.job_folder_evidence (
  job_id             uuid primary key references public.jobs(id) on delete cascade,
  company_id         uuid not null references public.companies(id) on delete cascade,
  device_id          uuid references public.helper_devices(id) on delete set null,
  folder             text not null,
  import_exists      boolean not null default false,
  -- [{name, images}] for each part folder inside the job folder (the session left out)
  import_parts       jsonb not null default '[]'::jsonb check (jsonb_typeof(import_parts) = 'array'),
  import_images      int not null default 0,
  -- The most images ever seen in PHOTO IMPORT, so clearing the Mac after the
  -- NAS copy is verified does not lower the bar the upload is checked against.
  import_images_max  int not null default 0,
  session_exists     boolean not null default false,
  session_images     int not null default 0,
  -- Null when the NAS was not mounted at the last report.
  upload_exists      boolean,
  upload_images      int,
  upload_receipt     boolean,
  folder_created_at  timestamptz,
  import_done_at     timestamptz,
  upload_done_at     timestamptz,
  reported_at        timestamptz not null default now()
);
create index job_folder_evidence_company_idx on public.job_folder_evidence (company_id);
create index job_folder_evidence_device_idx on public.job_folder_evidence (device_id);

alter table public.job_folder_evidence enable row level security;
revoke all on public.job_folder_evidence from anon, authenticated;
grant select on public.job_folder_evidence to authenticated;
grant all on public.job_folder_evidence to service_role;
create policy job_folder_evidence_select on public.job_folder_evidence for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()));
