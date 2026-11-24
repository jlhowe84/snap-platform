-- Prepay orders with no photos (production board, module 10).
--
-- After a job's images are in Captura, a prepay order whose player has no
-- image needs a makeup offer or a refund. A check, started by the office,
-- reads the job's gallery and lists those orders here. Each row is one order
-- and is worked to an outcome by a person; nothing here sends mail or moves
-- money. A later check clears a row once the player has images.
create table public.prepay_photo_cases (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  order_id        bigint not null,
  gallery_id      bigint not null,
  job_id          uuid references public.jobs(id) on delete set null,
  reason          text not null check (reason in ('no_images', 'no_player', 'not_in_gallery')),
  player          text check (player is null or length(player) <= 200),
  team            text check (team is null or length(team) <= 200),
  order_date      date,
  total           numeric(10,2),
  status          text not null default 'open'
                  check (status in ('open', 'offered', 'makeup_booked', 'refunded', 'closed')),
  note            text check (note is null or length(note) <= 1000),
  first_seen_at   timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  cleared_at      timestamptz,            -- a later check found the player's images
  updated_by      uuid references public.profiles(id) on delete set null,
  updated_at      timestamptz not null default now(),
  unique (company_id, order_id)
);
create index prepay_photo_cases_job_idx on public.prepay_photo_cases (job_id);
create index prepay_photo_cases_open_idx on public.prepay_photo_cases (company_id, status) where cleared_at is null;
create index prepay_photo_cases_updated_by_idx on public.prepay_photo_cases (updated_by);

create trigger prepay_photo_cases_updated_at before update on public.prepay_photo_cases
  for each row execute function private.set_updated_at();
create trigger prepay_photo_cases_log after insert or update or delete on public.prepay_photo_cases
  for each row execute function private.log_row_change();

-- Owner, admin and office only, like the orders these rows point at.
alter table public.prepay_photo_cases enable row level security;
revoke all on public.prepay_photo_cases from anon, authenticated;
grant select, insert, update, delete on public.prepay_photo_cases to authenticated;
grant all on public.prepay_photo_cases to service_role;

create policy prepay_photo_cases_select on public.prepay_photo_cases for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()));
create policy prepay_photo_cases_insert on public.prepay_photo_cases for insert to authenticated
  with check (company_id = (select private.current_company_id())
              and (select private.can_edit_ops())
              and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.company_id = prepay_photo_cases.company_id)));
create policy prepay_photo_cases_update on public.prepay_photo_cases for update to authenticated
  using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()))
  with check (company_id = (select private.current_company_id())
              and (select private.can_edit_ops())
              and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.company_id = prepay_photo_cases.company_id)));
create policy prepay_photo_cases_delete on public.prepay_photo_cases for delete to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));
