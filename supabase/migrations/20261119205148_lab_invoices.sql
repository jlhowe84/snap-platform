-- =============================================================================
-- Lab invoices: what the lab charged, order by order.
--
-- The lab emails one invoice per order as a PDF. The server reads each PDF by
-- rule, files the PDF in the company's Drive folder (one folder per month)
-- and stores the facts here, so lab costs can be added up by job, season and
-- year and any invoice can be found again.
--
-- An invoice names a customer, so these tables are for the office only
-- (owner, admin, office). Support-only staff, crew and league coordinators
-- see nothing. The server (service role) is the only writer; a person may
-- only say which job a lab job name belongs to.
-- =============================================================================

create table public.lab_invoices (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  lab                   text not null check (length(trim(lab)) between 1 and 60),
  invoice_number        text not null check (length(trim(invoice_number)) between 1 and 40),
  invoice_date          date not null,
  lab_order_number      text,
  received_date         date,
  online_order_number   text,
  -- The lab's "PO No".
  captura_order_number  text,
  -- The job's name as the lab prints it.
  reference             text,
  customer_name         text,
  subtotal              numeric(10,2) not null default 0,
  tax                   numeric(10,2) not null default 0,
  total                 numeric(10,2) not null default 0,
  payments              numeric(10,2),
  balance               numeric(10,2),
  -- From the item lines: what was made, and what it cost to ship.
  product_total         numeric(10,2) not null default 0,
  shipping_total        numeric(10,2) not null default 0,
  needs_check           boolean not null default false,
  check_note            text,
  job_id                uuid references public.jobs(id) on delete set null,
  captura_gallery_id    bigint,
  gallery_checked_at    timestamptz,
  mailbox               text,
  gmail_message_id      text,
  file_name             text,
  drive_file_id         text,
  drive_folder          text,
  created_at            timestamptz not null default now(),
  unique (company_id, lab, invoice_number)
);
create index lab_invoices_date_idx on public.lab_invoices (company_id, invoice_date desc);
create index lab_invoices_reference_idx on public.lab_invoices (company_id, reference);
create index lab_invoices_job_idx on public.lab_invoices (job_id);
create index lab_invoices_order_idx on public.lab_invoices (company_id, captura_order_number);
create index lab_invoices_message_idx on public.lab_invoices (company_id, gmail_message_id);

create table public.lab_invoice_items (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  invoice_id   uuid not null references public.lab_invoices(id) on delete cascade,
  position     integer not null,
  description  text not null,
  org_qty      integer not null default 1,
  each_qty     integer not null default 1,
  unit_price   numeric(10,2) not null default 0,
  extended     numeric(10,2) not null default 0,
  taxed        boolean not null default false,
  shipping     boolean not null default false,
  unique (invoice_id, position)
);
create index lab_invoice_items_company_idx on public.lab_invoice_items (company_id, description);

-- An invoice email that could not be read, so it is not tried again on every
-- run and a person can see that something was left out. No mail content.
create table public.lab_invoice_skips (
  company_id        uuid not null references public.companies(id) on delete cascade,
  gmail_message_id  text not null,
  file_name         text not null default '',
  mailbox           text not null,
  reason            text not null,
  created_at        timestamptz not null default now(),
  primary key (company_id, gmail_message_id, file_name)
);

-- Where the mail pickup left off, per mailbox. Server only.
create table public.lab_invoice_sync_state (
  company_id      uuid not null references public.companies(id) on delete cascade,
  mailbox         text not null,
  last_synced_at  timestamptz,
  last_run_at     timestamptz,
  last_error      text,
  primary key (company_id, mailbox)
);

alter table public.lab_invoices enable row level security;
alter table public.lab_invoice_items enable row level security;
alter table public.lab_invoice_skips enable row level security;
alter table public.lab_invoice_sync_state enable row level security;

revoke all on public.lab_invoices, public.lab_invoice_items, public.lab_invoice_skips, public.lab_invoice_sync_state from anon, authenticated;
grant select on public.lab_invoices, public.lab_invoice_items, public.lab_invoice_skips, public.lab_invoice_sync_state to authenticated;
grant all on public.lab_invoices, public.lab_invoice_items, public.lab_invoice_skips, public.lab_invoice_sync_state to service_role;

create policy lab_invoices_select on public.lab_invoices for select to authenticated
  using (company_id = (select private.current_company_id())
         and (select private.has_any_role('{owner,admin,office}'::public.app_role[])));
create policy lab_invoice_items_select on public.lab_invoice_items for select to authenticated
  using (company_id = (select private.current_company_id())
         and (select private.has_any_role('{owner,admin,office}'::public.app_role[])));
create policy lab_invoice_skips_select on public.lab_invoice_skips for select to authenticated
  using (company_id = (select private.current_company_id())
         and (select private.has_any_role('{owner,admin,office}'::public.app_role[])));
create policy lab_invoice_sync_state_select on public.lab_invoice_sync_state for select to authenticated
  using (company_id = (select private.current_company_id())
         and (select private.has_any_role('{owner,admin,office}'::public.app_role[])));

-- -----------------------------------------------------------------------------
-- Storing one invoice with its item lines, together or not at all. Service
-- role only. An invoice number the company already has is left as it is.
--
-- p_invoice is
--   { lab, invoice_number, invoice_date, lab_order_number, received_date,
--     online_order_number, captura_order_number, reference, customer_name,
--     subtotal, tax, total, payments, balance, needs_check, check_note,
--     mailbox, gmail_message_id, file_name, drive_file_id, drive_folder,
--     items: [{ description, org_qty, each_qty, unit_price, extended, taxed, shipping }] }
-- -----------------------------------------------------------------------------
create or replace function public.lab_invoice_store(p_company uuid, p_invoice jsonb)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if auth.uid() is not null then
    raise exception 'invoices are stored by the server only';
  end if;
  if p_invoice is null or jsonb_typeof(p_invoice) <> 'object' then
    raise exception 'an invoice must be an object';
  end if;

  insert into public.lab_invoices
    (company_id, lab, invoice_number, invoice_date, lab_order_number, received_date,
     online_order_number, captura_order_number, reference, customer_name,
     subtotal, tax, total, payments, balance, product_total, shipping_total,
     needs_check, check_note, mailbox, gmail_message_id, file_name, drive_file_id, drive_folder)
  select
    p_company, trim(p_invoice->>'lab'), trim(p_invoice->>'invoice_number'), (p_invoice->>'invoice_date')::date,
    nullif(left(p_invoice->>'lab_order_number', 40), ''), nullif(p_invoice->>'received_date', '')::date,
    nullif(left(p_invoice->>'online_order_number', 40), ''), nullif(left(p_invoice->>'captura_order_number', 40), ''),
    nullif(left(trim(p_invoice->>'reference'), 300), ''), nullif(left(trim(p_invoice->>'customer_name'), 200), ''),
    coalesce((p_invoice->>'subtotal')::numeric, 0), coalesce((p_invoice->>'tax')::numeric, 0),
    coalesce((p_invoice->>'total')::numeric, 0), (p_invoice->>'payments')::numeric, (p_invoice->>'balance')::numeric,
    coalesce((select sum((i->>'extended')::numeric) from jsonb_array_elements(coalesce(p_invoice->'items', '[]'::jsonb)) i
              where coalesce((i->>'shipping')::boolean, false) = false), 0),
    coalesce((select sum((i->>'extended')::numeric) from jsonb_array_elements(coalesce(p_invoice->'items', '[]'::jsonb)) i
              where coalesce((i->>'shipping')::boolean, false)), 0),
    coalesce((p_invoice->>'needs_check')::boolean, false), nullif(left(p_invoice->>'check_note', 500), ''),
    lower(nullif(p_invoice->>'mailbox', '')), nullif(p_invoice->>'gmail_message_id', ''),
    nullif(left(p_invoice->>'file_name', 200), ''), nullif(p_invoice->>'drive_file_id', ''), nullif(p_invoice->>'drive_folder', '')
  on conflict (company_id, lab, invoice_number) do nothing
  returning id into v_id;

  if v_id is null then
    return false;
  end if;

  insert into public.lab_invoice_items
    (company_id, invoice_id, position, description, org_qty, each_qty, unit_price, extended, taxed, shipping)
  select p_company, v_id, n::int, left(coalesce(i->>'description', ''), 300),
         coalesce((i->>'org_qty')::int, 1), coalesce((i->>'each_qty')::int, 1),
         coalesce((i->>'unit_price')::numeric, 0), coalesce((i->>'extended')::numeric, 0),
         coalesce((i->>'taxed')::boolean, false), coalesce((i->>'shipping')::boolean, false)
  from jsonb_array_elements(coalesce(p_invoice->'items', '[]'::jsonb)) with ordinality as x(i, n);

  return true;
end;
$$;

revoke all on function public.lab_invoice_store(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.lab_invoice_store(uuid, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- Tying invoices to jobs. The lab prints the job's name (the reference) on
-- every invoice, so what is known for one invoice of a reference holds for
-- the rest: the Captura gallery, and the job that gallery belongs to. A job a
-- person chose for a reference is carried to its later invoices the same way.
-- Service role only. Returns how many invoices gained a job.
-- -----------------------------------------------------------------------------
create or replace function public.lab_invoices_link(p_company uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer := 0;
  v_rows  integer;
begin
  if auth.uid() is not null then
    raise exception 'invoices are linked by the server only';
  end if;

  update public.lab_invoices i
  set captura_gallery_id = s.gallery
  from (
    select reference, min(captura_gallery_id) as gallery
    from public.lab_invoices
    where company_id = p_company and reference is not null and captura_gallery_id is not null
    group by reference
    having count(distinct captura_gallery_id) = 1
  ) s
  where i.company_id = p_company and i.reference = s.reference and i.captura_gallery_id is null;

  update public.lab_invoices i
  set job_id = l.job_id
  from public.job_links l
  where i.company_id = p_company and i.job_id is null
    and l.company_id = p_company and l.captura_gallery_id = i.captura_gallery_id;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  update public.lab_invoices i
  set job_id = s.job_id
  from (
    select reference, min(job_id::text)::uuid as job_id
    from public.lab_invoices
    where company_id = p_company and reference is not null and job_id is not null
    group by reference
    having count(distinct job_id) = 1
  ) s
  where i.company_id = p_company and i.reference = s.reference and i.job_id is null;
  get diagnostics v_rows = row_count;
  return v_count + v_rows;
end;
$$;

revoke all on function public.lab_invoices_link(uuid) from public, anon, authenticated;
grant execute on function public.lab_invoices_link(uuid) to service_role;

-- The office says which job a lab job name belongs to (or clears it with a
-- null job). Every invoice with that reference follows.
create or replace function public.lab_assign_reference(p_reference text, p_job uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.current_company_id();
  v_rows    integer;
begin
  if v_company is null or not private.has_any_role('{owner,admin,office}'::public.app_role[]) then
    raise exception 'only the office can match invoices to a job';
  end if;
  if coalesce(trim(p_reference), '') = '' then
    raise exception 'a lab job name is needed';
  end if;
  if p_job is not null and not exists (select 1 from public.jobs j where j.id = p_job and j.company_id = v_company) then
    raise exception 'that job was not found';
  end if;

  update public.lab_invoices
  set job_id = p_job
  where company_id = v_company and reference = p_reference and job_id is distinct from p_job;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.lab_assign_reference(text, uuid) from public, anon;
grant execute on function public.lab_assign_reference(text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Lab costs added up: one row per lab job name, job and calendar year of the
-- invoice date. Runs as the person asking, so RLS decides what is counted.
-- The season is the job's when the invoices are tied to a job, and otherwise
-- the season of the reference's first invoice.
-- -----------------------------------------------------------------------------
create or replace function public.lab_cost_summary()
returns table (
  reference text, job_id uuid, job_name text, season text, year integer,
  invoices bigint, products numeric, shipping numeric, tax numeric, total numeric,
  needs_check bigint, first_invoice date, last_invoice date
)
language sql stable security invoker set search_path = '' as $$
  select
    coalesce(i.reference, '(no job name)'),
    i.job_id,
    max(j.name),
    coalesce(max(j.season), public.season_label(min(min(i.invoice_date)) over (partition by i.reference, i.job_id))),
    extract(year from i.invoice_date)::int,
    count(*),
    sum(i.product_total),
    sum(i.shipping_total),
    sum(i.tax),
    sum(i.total),
    count(*) filter (where i.needs_check),
    min(i.invoice_date),
    max(i.invoice_date)
  from public.lab_invoices i
  left join public.job_overview j on j.id = i.job_id
  group by i.reference, i.job_id, extract(year from i.invoice_date)
$$;

revoke all on function public.lab_cost_summary() from public, anon;
grant execute on function public.lab_cost_summary() to authenticated, service_role;
