-- =============================================================================
-- Lab invoices, second pass: an invoice can hold several orders, and each
-- order is matched to its Captura order to show what it earned.
--
-- Live invoices showed that one invoice may carry several orders, each with
-- its own PO number, job name and customer, under one total; and that a
-- remake order has no customer line. So the order facts move from the invoice
-- to lab_invoice_orders, one row per order on an invoice, with its own share
-- of the invoice's cost (its item lines plus a share of the tax).
--
-- Each order row also keeps the money on its Captura order (read only):
-- what the customer paid, Captura's fees and the net pay, so profit per order
-- is net pay less what the lab charged.
--
-- The invoices stored so far were read with the first rules, so they are
-- cleared here and read again from the mail on the next check. Their PDFs
-- stay in Drive and are not filed twice.
-- =============================================================================

truncate public.lab_invoice_items, public.lab_invoices, public.lab_invoice_skips;
update public.lab_invoice_sync_state set last_synced_at = null, last_error = null;

drop function if exists public.lab_cost_summary();
drop index if exists public.lab_invoices_reference_idx;
drop index if exists public.lab_invoices_job_idx;
drop index if exists public.lab_invoices_order_idx;
alter table public.lab_invoices
  drop column lab_order_number,
  drop column received_date,
  drop column online_order_number,
  drop column captura_order_number,
  drop column reference,
  drop column customer_name,
  drop column product_total,
  drop column shipping_total,
  drop column job_id,
  drop column captura_gallery_id,
  drop column gallery_checked_at;

create table public.lab_invoice_orders (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  invoice_id            uuid not null references public.lab_invoices(id) on delete cascade,
  position              integer not null,
  lab_order_number      text,
  received_date         date,
  online_order_number   text,
  -- The lab's "PO No".
  captura_order_number  text,
  -- The job's name as the lab prints it.
  reference             text,
  customer_name         text,
  -- What the lab charged for this order: its lines and its share of the tax.
  products              numeric(10,2) not null default 0,
  shipping              numeric(10,2) not null default 0,
  tax                   numeric(10,2) not null default 0,
  total                 numeric(10,2) not null default 0,
  job_id                uuid references public.jobs(id) on delete set null,
  captura_gallery_id    bigint,
  -- The Captura order, read when the order is first seen.
  captura_checked_at    timestamptz,
  captura_found         boolean,
  order_total           numeric(10,2),
  order_tax             numeric(10,2),
  order_shipping        numeric(10,2),
  order_refunded        numeric(10,2),
  order_fees            numeric(10,2),
  order_lab_fees        numeric(10,2),
  order_net_pay         numeric(10,2),
  order_pay_date        date,
  order_payment_status  text,
  unique (invoice_id, position)
);
create index lab_invoice_orders_reference_idx on public.lab_invoice_orders (company_id, reference);
create index lab_invoice_orders_po_idx on public.lab_invoice_orders (company_id, captura_order_number);
create index lab_invoice_orders_job_idx on public.lab_invoice_orders (job_id);
create index lab_invoice_orders_check_idx on public.lab_invoice_orders (company_id, captura_checked_at);

alter table public.lab_invoice_items
  add column order_id uuid references public.lab_invoice_orders(id) on delete cascade;
create index lab_invoice_items_order_idx on public.lab_invoice_items (order_id);

alter table public.lab_invoice_orders enable row level security;
revoke all on public.lab_invoice_orders from anon, authenticated;
grant select on public.lab_invoice_orders to authenticated;
grant all on public.lab_invoice_orders to service_role;
create policy lab_invoice_orders_select on public.lab_invoice_orders for select to authenticated
  using (company_id = (select private.current_company_id())
         and (select private.has_any_role('{owner,admin,office}'::public.app_role[])));

-- -----------------------------------------------------------------------------
-- Storing one invoice with its orders and their item lines, together or not
-- at all. Service role only. An invoice number the company already has is
-- left as it is.
--
-- p_invoice is
--   { lab, invoice_number, invoice_date, subtotal, tax, total, payments,
--     balance, needs_check, check_note, mailbox, gmail_message_id, file_name,
--     drive_file_id, drive_folder,
--     orders: [{ lab_order_number, received_date, online_order_number,
--                captura_order_number, reference, customer_name,
--                products, shipping, tax, total,
--                items: [{ description, org_qty, each_qty, unit_price,
--                          extended, taxed, shipping }] }] }
-- -----------------------------------------------------------------------------
create or replace function public.lab_invoice_store(p_company uuid, p_invoice jsonb)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_id    uuid;
  v_order uuid;
  o       jsonb;
  n       bigint;
begin
  if auth.uid() is not null then
    raise exception 'invoices are stored by the server only';
  end if;
  if p_invoice is null or jsonb_typeof(p_invoice) <> 'object' then
    raise exception 'an invoice must be an object';
  end if;

  insert into public.lab_invoices
    (company_id, lab, invoice_number, invoice_date, subtotal, tax, total, payments, balance,
     needs_check, check_note, mailbox, gmail_message_id, file_name, drive_file_id, drive_folder)
  values (
    p_company, trim(p_invoice->>'lab'), trim(p_invoice->>'invoice_number'), (p_invoice->>'invoice_date')::date,
    coalesce((p_invoice->>'subtotal')::numeric, 0), coalesce((p_invoice->>'tax')::numeric, 0),
    coalesce((p_invoice->>'total')::numeric, 0), (p_invoice->>'payments')::numeric, (p_invoice->>'balance')::numeric,
    coalesce((p_invoice->>'needs_check')::boolean, false), nullif(left(p_invoice->>'check_note', 500), ''),
    lower(nullif(p_invoice->>'mailbox', '')), nullif(p_invoice->>'gmail_message_id', ''),
    nullif(left(p_invoice->>'file_name', 200), ''), nullif(p_invoice->>'drive_file_id', ''), nullif(p_invoice->>'drive_folder', ''))
  on conflict (company_id, lab, invoice_number) do nothing
  returning id into v_id;

  if v_id is null then
    return false;
  end if;

  for o, n in
    select e, k from jsonb_array_elements(coalesce(p_invoice->'orders', '[]'::jsonb)) with ordinality as x(e, k)
  loop
    insert into public.lab_invoice_orders
      (company_id, invoice_id, position, lab_order_number, received_date, online_order_number,
       captura_order_number, reference, customer_name, products, shipping, tax, total)
    values (
      p_company, v_id, n::int,
      nullif(left(o->>'lab_order_number', 40), ''), nullif(o->>'received_date', '')::date,
      nullif(left(o->>'online_order_number', 40), ''), nullif(left(o->>'captura_order_number', 40), ''),
      nullif(left(trim(o->>'reference'), 300), ''), nullif(left(trim(o->>'customer_name'), 200), ''),
      coalesce((o->>'products')::numeric, 0), coalesce((o->>'shipping')::numeric, 0),
      coalesce((o->>'tax')::numeric, 0), coalesce((o->>'total')::numeric, 0))
    returning id into v_order;

    insert into public.lab_invoice_items
      (company_id, invoice_id, order_id, position, description, org_qty, each_qty, unit_price, extended, taxed, shipping)
    select p_company, v_id, v_order, (n * 1000 + k)::int, left(coalesce(i->>'description', ''), 300),
           coalesce((i->>'org_qty')::int, 1), coalesce((i->>'each_qty')::int, 1),
           coalesce((i->>'unit_price')::numeric, 0), coalesce((i->>'extended')::numeric, 0),
           coalesce((i->>'taxed')::boolean, false), coalesce((i->>'shipping')::boolean, false)
    from jsonb_array_elements(coalesce(o->'items', '[]'::jsonb)) with ordinality as y(i, k);
  end loop;

  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tying orders to jobs. An order's Captura gallery, once known, ties it to the
-- job whose link has that gallery. What is known for one order of a lab job
-- name (its gallery, or its job) holds for that name's other orders.
-- Service role only. Returns how many orders gained a job.
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

  update public.lab_invoice_orders o
  set captura_gallery_id = s.gallery
  from (
    select reference, min(captura_gallery_id) as gallery
    from public.lab_invoice_orders
    where company_id = p_company and reference is not null and captura_gallery_id is not null
    group by reference
    having count(distinct captura_gallery_id) = 1
  ) s
  where o.company_id = p_company and o.reference = s.reference and o.captura_gallery_id is null;

  update public.lab_invoice_orders o
  set job_id = l.job_id
  from public.job_links l
  where o.company_id = p_company and o.job_id is null
    and l.company_id = p_company and l.captura_gallery_id = o.captura_gallery_id;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  update public.lab_invoice_orders o
  set job_id = s.job_id
  from (
    select reference, min(job_id::text)::uuid as job_id
    from public.lab_invoice_orders
    where company_id = p_company and reference is not null and job_id is not null
    group by reference
    having count(distinct job_id) = 1
  ) s
  where o.company_id = p_company and o.reference = s.reference and o.job_id is null;
  get diagnostics v_rows = row_count;
  return v_count + v_rows;
end;
$$;

-- The office says which job a lab job name belongs to (or clears it with a
-- null job). Every order with that name follows.
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

  update public.lab_invoice_orders
  set job_id = p_job
  where company_id = v_company and reference = p_reference and job_id is distinct from p_job;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- -----------------------------------------------------------------------------
-- Lab costs and earnings added up: one row per lab job name, job and calendar
-- year of the invoice date. Runs as the person asking, so RLS decides what is
-- counted. A Captura order the lab invoiced more than once (a remake, say)
-- counts its earnings once, on its first invoice, and every lab charge for it.
-- "priced" counts the orders whose Captura order was found, and
-- priced_lab_total is what the lab charged for those, so profit is net_pay
-- less priced_lab_total.
-- -----------------------------------------------------------------------------
create or replace function public.lab_cost_summary()
returns table (
  reference text, job_id uuid, job_name text, season text, year integer,
  invoices bigint, orders bigint, products numeric, shipping numeric, tax numeric, total numeric,
  needs_check bigint, priced bigint, order_total numeric, fees numeric, net_pay numeric, priced_lab_total numeric
)
language sql stable security invoker set search_path = '' as $$
  with o as (
    select lo.*, i.invoice_date, i.needs_check,
           row_number() over (partition by lo.captura_order_number order by i.invoice_date, lo.id) as first_seen
    from public.lab_invoice_orders lo
    join public.lab_invoices i on i.id = lo.invoice_id
  )
  select
    coalesce(o.reference, '(no job name)'),
    o.job_id,
    max(j.name),
    coalesce(max(j.season), public.season_label(min(min(o.invoice_date)) over (partition by o.reference, o.job_id))),
    extract(year from o.invoice_date)::int,
    count(distinct o.invoice_id),
    count(*),
    sum(o.products),
    sum(o.shipping),
    sum(o.tax),
    sum(o.total),
    count(*) filter (where o.needs_check),
    count(*) filter (where o.order_net_pay is not null),
    coalesce(sum(o.order_total) filter (where o.order_net_pay is not null and o.first_seen = 1), 0),
    coalesce(sum(o.order_fees) filter (where o.order_net_pay is not null and o.first_seen = 1), 0),
    coalesce(sum(o.order_net_pay) filter (where o.first_seen = 1), 0),
    coalesce(sum(o.total) filter (where o.order_net_pay is not null), 0)
  from o
  left join public.job_overview j on j.id = o.job_id
  group by o.reference, o.job_id, extract(year from o.invoice_date)
$$;

revoke all on function public.lab_cost_summary() from public, anon;
grant execute on function public.lab_cost_summary() to authenticated, service_role;
