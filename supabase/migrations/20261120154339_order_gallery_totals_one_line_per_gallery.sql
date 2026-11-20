-- One line per gallery. A gallery can serve more than one job (two photo days
-- kept as two jobs share one gallery); the totals used to repeat once per job.
-- The line now names the job with the earliest photo day.
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
  with pick as (
    select distinct on (l.company_id, l.captura_gallery_id)
           l.company_id,
           l.captura_gallery_id as gallery_id,
           l.job_id,
           j.name as job_name
      from public.job_links l
      join public.jobs j on j.id = l.job_id
     where l.captura_gallery_id is not null
     order by l.company_id, l.captura_gallery_id,
              (select min(d.date) from public.photo_days d where d.job_id = j.id) nulls last, j.id
  )
  select o.gallery_id,
         g.title,
         jl.job_id,
         jl.job_name,
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
    left join pick jl on jl.company_id = o.company_id and jl.gallery_id = o.gallery_id
   where (p_from is null or o.order_date >= p_from)
     and (p_to is null or o.order_date <= p_to)
     and (p_gallery is null or o.gallery_id = p_gallery)
   group by o.gallery_id, g.title, jl.job_id, jl.job_name
$$;

revoke all on function public.order_gallery_totals(date, date, bigint) from public, anon;
grant execute on function public.order_gallery_totals(date, date, bigint) to authenticated, service_role;
