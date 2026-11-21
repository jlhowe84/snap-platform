-- What the lab charged, added up by Captura gallery, for the orders page.
-- A lab order carries the Captura order number (the lab's "PO No"); the order
-- ledger says which gallery that order belongs to. Lab orders the ledger does
-- not hold fall back to the gallery read when the invoice came in. Runs as the
-- caller, so only the roles that can read lab invoices get rows.
create or replace function public.lab_gallery_totals()
returns table (
  gallery_id  bigint,
  lab_orders  int,
  lab_total   numeric
)
language sql stable security invoker set search_path = '' as $$
  select coalesce(o.gallery_id, l.captura_gallery_id),
         count(*)::int,
         coalesce(sum(l.total), 0)
    from public.lab_invoice_orders l
    left join public.captura_orders o
      on o.company_id = l.company_id
     and l.captura_order_number ~ '^[0-9]{1,18}$'
     and o.order_id = l.captura_order_number::bigint
   group by 1
$$;

revoke all on function public.lab_gallery_totals() from public, anon;
grant execute on function public.lab_gallery_totals() to authenticated, service_role;
