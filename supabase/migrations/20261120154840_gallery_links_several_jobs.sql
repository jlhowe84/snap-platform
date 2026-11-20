-- A gallery can serve more than one job (a league whose photo days are kept
-- as separate jobs shares one gallery). Linking a job to a gallery no longer
-- takes the gallery away from the other jobs; clearing with no job still
-- clears every job, and unlink_gallery_job clears one.
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
  if p_job is null then
    update public.job_links set captura_gallery_id = null, updated_at = now()
     where company_id = v_company and captura_gallery_id = p_gallery;
    return;
  end if;
  if not exists (select 1 from public.jobs where id = p_job and company_id = v_company) then
    raise exception 'no such job' using errcode = '22023';
  end if;
  insert into public.job_links (job_id, company_id, captura_gallery_id)
  values (p_job, v_company, p_gallery)
  on conflict (job_id) do update set captura_gallery_id = excluded.captura_gallery_id, updated_at = now();
end $$;

create or replace function public.unlink_gallery_job(p_job uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_company uuid := private.current_company_id();
begin
  if v_company is null or not private.can_edit_ops() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.job_links set captura_gallery_id = null, updated_at = now()
   where company_id = v_company and job_id = p_job;
end $$;

revoke all on function public.unlink_gallery_job(uuid) from public, anon;
grant execute on function public.unlink_gallery_job(uuid) to authenticated;
