-- =============================================================================
-- Order ledger (Wave C, module 16): every Captura order, read through the
-- API and kept here so revenue, prepay share, refunds and net pay can be
-- counted per gallery, job, league and season without a Captura login.
--
-- The sync is a server job (service role). People only read. No names,
-- addresses or emails are stored: a buyer is a one-way key made from the
-- billing email so repeat buyers can be counted. Line items are not here:
-- Captura's order list does not carry them.
-- =============================================================================

-- One row per Captura gallery seen on an order. The job comes from
-- job_links.captura_gallery_id, so a gallery is tied to a job in one place.
create table public.captura_galleries (
  company_id     uuid not null references public.companies(id) on delete cascade,
  gallery_id     bigint not null,
  title          text,
  first_order_on date,
  last_order_on  date,
  refreshed_at   timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (company_id, gallery_id)
);

create table public.captura_orders (
  company_id      uuid not null references public.companies(id) on delete cascade,
  order_id        bigint not null,
  gallery_id      bigint,
  ordered_at      timestamptz not null,
  order_date      date not null,          -- in the company's time zone
  order_type      text not null default 'unknown'
                  check (order_type in ('prepay', 'gallery', 'internal', 'reprint', 'unknown')),
  status          text not null default 'unknown' check (status in ('placed', 'refunded', 'unknown')),
  payment_status  text,                   -- Captura's own word
  fulfillment     text not null default 'unknown'
                  check (fulfillment in ('pending', 'shipped', 'delivered', 'unknown')),
  delivery        text not null default 'unknown'
                  check (delivery in ('league', 'mailer', 'pickup', 'unknown')),
  subtotal        numeric(10,2),
  tax             numeric(10,2),
  shipping        numeric(10,2),
  handling        numeric(10,2),
  discount        numeric(10,2),
  total           numeric(10,2),
  refunded        numeric(10,2),          -- a positive amount
  background_fee  numeric(10,2),
  fees            numeric(10,2),          -- Captura's processing and transaction fees
  lab_fees        numeric(10,2),
  net_pay         numeric(10,2),
  pay_date        date,
  lab_order_ids   text[] not null default '{}',
  subject_ids     text[] not null default '{}',
  buyer_key       text check (buyer_key is null or buyer_key ~ '^[0-9a-f]{16}$'),
  synced_at       timestamptz not null default now(),
  primary key (company_id, order_id)
);

create index captura_orders_date_idx on public.captura_orders (company_id, order_date);
create index captura_orders_gallery_idx on public.captura_orders (company_id, gallery_id);

-- Where the sync is: the next stretch of days to read for the history, and
-- the page within it, so a run that stops halfway picks up where it was.
create table public.captura_order_sync (
  company_id    uuid primary key references public.companies(id) on delete cascade,
  next_from     date,
  next_start    int not null default 1 check (next_start >= 1),
  history_done  boolean not null default false,
  last_run_at   timestamptz,
  last_error    text,
  last_counts   jsonb not null default '{}'::jsonb
);

-- Owner, admin and office read; nobody writes but the server.
do $$
declare t text;
begin
  foreach t in array array['captura_galleries', 'captura_orders', 'captura_order_sync'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format($p$create policy %I on public.%I for select to authenticated
      using (company_id = (select private.current_company_id())
             and (select private.has_any_role('{owner,admin,office}'::public.app_role[])))$p$, t || '_select', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Totals per gallery for orders dated in a stretch of days. Internal orders
-- (SNAP's own) are counted apart and left out of the money. Refunds are shown,
-- never taken off the gross. Runs as the caller, so the policies above apply.
-- -----------------------------------------------------------------------------
create or replace function public.order_gallery_totals(p_from date default null, p_to date default null, p_gallery bigint default null)
returns table (
  gallery_id      bigint,
  title           text,
  job_id          uuid,
  job_name        text,
  first_order_on  date,
  last_order_on   date,
  orders          int,
  prepay_orders   int,
  gallery_orders  int,
  refunded_orders int,
  internal_orders int,
  gross           numeric,
  refunded        numeric,
  net_pay         numeric,
  buyers          int
)
language sql stable security invoker set search_path = '' as $$
  select o.gallery_id,
         g.title,
         jl.job_id,
         j.name,
         min(o.order_date) filter (where o.order_type <> 'internal'),
         max(o.order_date) filter (where o.order_type <> 'internal'),
         (count(*) filter (where o.order_type <> 'internal'))::int,
         (count(*) filter (where o.order_type = 'prepay'))::int,
         (count(*) filter (where o.order_type = 'gallery'))::int,
         (count(*) filter (where o.status = 'refunded' and o.order_type <> 'internal'))::int,
         (count(*) filter (where o.order_type = 'internal'))::int,
         coalesce(sum(o.total) filter (where o.order_type <> 'internal'), 0),
         coalesce(sum(o.refunded) filter (where o.order_type <> 'internal'), 0),
         coalesce(sum(o.net_pay) filter (where o.order_type <> 'internal'), 0),
         (count(distinct o.buyer_key) filter (where o.order_type <> 'internal'))::int
    from public.captura_orders o
    left join public.captura_galleries g on g.company_id = o.company_id and g.gallery_id = o.gallery_id
    left join public.job_links jl on jl.company_id = o.company_id and jl.captura_gallery_id = o.gallery_id
    left join public.jobs j on j.id = jl.job_id
   where (p_from is null or o.order_date >= p_from)
     and (p_to is null or o.order_date <= p_to)
     and (p_gallery is null or o.gallery_id = p_gallery)
   group by o.gallery_id, g.title, jl.job_id, j.name
$$;

-- Orders and money per day, for comparing one stretch with the same days a
-- year earlier. Internal orders are left out.
create or replace function public.order_daily_totals(p_from date, p_to date)
returns table (order_date date, orders int, prepay_orders int, gross numeric, net_pay numeric)
language sql stable security invoker set search_path = '' as $$
  select o.order_date,
         count(*)::int,
         (count(*) filter (where o.order_type = 'prepay'))::int,
         coalesce(sum(o.total), 0),
         coalesce(sum(o.net_pay), 0)
    from public.captura_orders o
   where o.order_date between p_from and p_to
     and o.order_type <> 'internal'
   group by o.order_date
$$;

revoke all on function public.order_gallery_totals(date, date, bigint) from public, anon;
revoke all on function public.order_daily_totals(date, date) from public, anon;
grant execute on function public.order_gallery_totals(date, date, bigint) to authenticated, service_role;
grant execute on function public.order_daily_totals(date, date) to authenticated, service_role;

-- Tying a gallery to a job from the orders page: the job's Captura gallery
-- is set, or cleared from whichever job had it. Ops editors only.
create or replace function public.link_gallery_to_job(p_gallery bigint, p_job uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_company uuid := private.current_company_id();
begin
  if v_company is null or not private.can_edit_ops() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_gallery is null or p_gallery <= 0 then
    raise exception 'pick a gallery' using errcode = '22023';
  end if;
  update public.job_links set captura_gallery_id = null, updated_at = now()
   where company_id = v_company and captura_gallery_id = p_gallery and (p_job is null or job_id <> p_job);
  if p_job is not null then
    if not exists (select 1 from public.jobs where id = p_job and company_id = v_company) then
      raise exception 'no such job' using errcode = '22023';
    end if;
    insert into public.job_links (job_id, company_id, captura_gallery_id)
    values (p_job, v_company, p_gallery)
    on conflict (job_id) do update set captura_gallery_id = excluded.captura_gallery_id, updated_at = now();
  end if;
end $$;

revoke all on function public.link_gallery_to_job(bigint, uuid) from public, anon;
grant execute on function public.link_gallery_to_job(bigint, uuid) to authenticated;
