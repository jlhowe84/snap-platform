-- Sets each gallery's first and last order dates in one statement, in place
-- of two queries per gallery. Server jobs only.
create or replace function public.stamp_captura_galleries(p_company uuid, p_galleries bigint[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.captura_galleries g
     set first_order_on = s.first_on, last_order_on = s.last_on
    from (
      select o.gallery_id, min(o.order_date) as first_on, max(o.order_date) as last_on
        from public.captura_orders o
       where o.company_id = p_company
         and o.gallery_id = any (p_galleries)
         and o.order_type <> 'internal'
       group by o.gallery_id
    ) s
   where g.company_id = p_company
     and g.gallery_id = s.gallery_id;
$$;

revoke all on function public.stamp_captura_galleries(uuid, bigint[]) from public, anon, authenticated;
grant execute on function public.stamp_captura_galleries(uuid, bigint[]) to service_role;
