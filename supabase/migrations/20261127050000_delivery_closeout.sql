-- =============================================================================
-- Delivery and close-out (spec module 11).
--
--   jobs.gallery_live_at   when the office announced the galleries. Images can
--                          be in the galleries earlier; ticking Galleries live
--                          on the job drafts the notice to the coordinator.
--   jobs.order_deadline    the last day for orders, named in that notice.
--   jobs.delivered_at      set the moment a job's status becomes delivered.
--   jobs.closed_out_at     set when the close-out email is drafted.
--   job_obligations        money owed out (rebate and sponsorship checks,
--                          donations, facility fees SNAP covers), league
--                          delivery boxes to drop off, and charges to a league.
--                          Each has a due date and an owner and closes with a
--                          note or a QuickBooks reference.
--
-- Obligations hold what a league is paid, so only the office roles (owner,
-- admin, office) read or change them. Support, crew, coordinators and anyone
-- signed out see nothing.
-- =============================================================================

alter table public.jobs
  add column gallery_live_at  timestamptz,
  add column gallery_live_by  uuid references public.profiles(id) on delete set null,
  add column order_deadline   date,
  add column delivered_at     timestamptz,
  add column closed_out_at    timestamptz;
create index jobs_gallery_live_by_idx on public.jobs (gallery_live_by);
create index jobs_delivered_idx on public.jobs (company_id, delivered_at) where delivered_at is not null and closed_out_at is null;

-- The day a job was delivered is recorded once, when its status first
-- becomes delivered. Jobs delivered before this existed keep no date, so the
-- close-out clock never drafts for old seasons.
create or replace function private.jobs_stamp_delivered()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' and new.delivered_at is null then
    new.delivered_at := now();
  end if;
  return new;
end $$;
create trigger jobs_stamp_delivered before update of status on public.jobs
  for each row execute function private.jobs_stamp_delivered();

create table public.job_obligations (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  job_id          uuid not null references public.jobs(id) on delete cascade,
  org_id          uuid references public.organizations(id) on delete set null,
  kind            text not null check (kind in ('rebate', 'sponsorship', 'donation', 'facility_fee', 'delivery_box', 'charge', 'other')),
  direction       text not null default 'owed_out' check (direction in ('owed_out', 'owed_in')),
  title           text not null check (length(btrim(title)) between 1 and 200),
  -- The league term it came from ("20% Rebate"), or why it was added.
  basis           text check (char_length(basis) <= 500),
  -- Null until known: the office types amounts the terms do not give.
  amount          numeric(10, 2) check (amount is null or amount >= 0),
  -- How a computed amount was reached: {rule, pct?, per_order?, prepay_sales?, prepay_orders?, gallery_id?, shared_gallery?}
  computed        jsonb,
  -- True once a person changes the amount, so working the amounts out again leaves it alone.
  amount_edited   boolean not null default false,
  -- Obligations made from the league's terms carry the term, so working them out again updates the same row.
  term_key        text,
  due_on          date,
  owner_id        uuid references public.profiles(id) on delete set null,
  status          text not null default 'open' check (status in ('open', 'closed', 'void')),
  closed_note     text check (char_length(closed_note) <= 1000),
  quickbooks_ref  text check (char_length(quickbooks_ref) <= 200),
  closed_at       timestamptz,
  closed_by       uuid references public.profiles(id) on delete set null,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (status = 'open' or closed_at is not null)
);
create index job_obligations_company_idx on public.job_obligations (company_id, status, due_on);
create index job_obligations_job_idx on public.job_obligations (job_id);
create index job_obligations_org_idx on public.job_obligations (org_id);
create index job_obligations_owner_idx on public.job_obligations (owner_id);
create index job_obligations_closed_by_idx on public.job_obligations (closed_by);
create index job_obligations_created_by_idx on public.job_obligations (created_by);
create unique index job_obligations_one_per_term on public.job_obligations (job_id, term_key) where term_key is not null;

create trigger job_obligations_updated_at before update on public.job_obligations
  for each row execute function private.set_updated_at();

alter table public.job_obligations enable row level security;
grant select, insert, update, delete on public.job_obligations to authenticated;
grant all on public.job_obligations to service_role;

create policy job_obligations_select on public.job_obligations for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()));
create policy job_obligations_insert on public.job_obligations for insert to authenticated
  with check (company_id = (select private.current_company_id()) and (select private.can_edit_ops())
              and exists (select 1 from public.jobs j where j.id = job_id and j.company_id = (select private.current_company_id())));
create policy job_obligations_update on public.job_obligations for update to authenticated
  using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()))
  with check (company_id = (select private.current_company_id()));
create policy job_obligations_delete on public.job_obligations for delete to authenticated
  using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()));

-- The two new drafts wait in the approval queue like every other message,
-- and the close-out comes two weeks after delivery unless a company changes it.
insert into public.action_types (company_id, key, description, kind, autonomy_level)
select c.id, v.key, v.description, 'propose', 1
from public.companies c
cross join (values
  ('delivery.gallery_live', 'Tell a league its galleries are live, with the parent kit'),
  ('delivery.closeout',     'Thank a league after delivery, ask for feedback and next season''s date')
) as v(key, description)
on conflict (company_id, key) do nothing;

insert into public.settings (company_id, key, value)
select c.id, 'closeout.days_after_delivery', '14'::jsonb from public.companies c
on conflict (company_id, key) do nothing;
