-- Combining jobs. The Notion import made one job per photo day, so one
-- league season is often several jobs. A job holds several photo days, so
-- those belong in one job: combine_jobs moves the other job's photo days and
-- everything hanging off it onto the job that is kept, then removes the
-- emptied job. It cannot be undone.
--
-- The job being absorbed must not have planning of its own (a signed
-- agreement, a planning form, rosters, teams, a schedule, a day page, portal
-- links or a date hold): those belong to one job and are not merged. Keep
-- that job and absorb the other one instead.

create or replace function private.combine_jobs_inner(p_company uuid, p_keep uuid, p_other uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_keep  public.jobs%rowtype;
  v_other public.jobs%rowtype;
  v_days  text;
begin
  if p_keep is null or p_other is null or p_keep = p_other then
    raise exception 'pick two different jobs' using errcode = '22023';
  end if;
  -- Lock both in a fixed order so two people combining at once cannot cross.
  perform 1 from public.jobs where id in (p_keep, p_other) and company_id = p_company order by id for update;
  select * into v_keep from public.jobs where id = p_keep and company_id = p_company;
  select * into v_other from public.jobs where id = p_other and company_id = p_company;
  if v_keep.id is null or v_other.id is null then
    raise exception 'no such job' using errcode = '22023';
  end if;
  if v_keep.org_id is distinct from v_other.org_id then
    raise exception 'both jobs must belong to the same league' using errcode = '22023';
  end if;
  if v_keep.status in ('cancelled', 'released') and v_other.status not in ('cancelled', 'released') then
    raise exception 'keep the job that is not cancelled' using errcode = '22023';
  end if;
  if exists (select 1 from public.agreement_signatures where job_id = p_other)
     or exists (select 1 from public.planning_forms where job_id = p_other)
     or exists (select 1 from public.roster_files where job_id = p_other)
     or exists (select 1 from public.roster_versions where job_id = p_other)
     or exists (select 1 from public.teams where job_id = p_other)
     or exists (select 1 from public.schedules where job_id = p_other)
     or exists (select 1 from public.schedule_slots where job_id = p_other)
     or exists (select 1 from public.day_pages where job_id = p_other)
     or exists (select 1 from public.portal_links where job_id = p_other)
     or exists (select 1 from public.job_coordinators where job_id = p_other)
     or exists (select 1 from public.date_holds where job_id = p_other)
     or exists (select 1 from public.date_changes where job_id = p_other) then
    raise exception 'that job has planning of its own; keep it and combine the other job into it' using errcode = '22023';
  end if;

  select string_agg(to_char(d.date, 'Mon FMDD, YYYY'), ', ' order by d.date) into v_days
    from public.photo_days d where d.job_id = p_other;

  -- Photo days. A day from a cancelled job stays cancelled; a day from a job
  -- with another name keeps that name as its label.
  perform set_config('app.date_change', '1', true);
  update public.photo_days d set
    job_id = p_keep,
    status = case when v_other.status in ('cancelled', 'released') and d.status = 'scheduled' then 'cancelled' else d.status end,
    label  = case when d.label is null and v_other.name is distinct from v_keep.name then v_other.name else d.label end
  where d.job_id = p_other;
  perform set_config('app.date_change', '', true);
  -- Shifts and kit checkouts take their job from their photo day.
  update public.shifts set job_id = p_keep where job_id = p_other;
  update public.kit_checkouts set job_id = p_keep where job_id = p_other;

  update public.tasks set job_id = p_keep where job_id = p_other;
  update public.touchpoints set job_id = p_keep where job_id = p_other;
  update public.job_messages set job_id = p_keep where job_id = p_other;
  update public.agent_events set job_id = p_keep where job_id = p_other;
  update public.clock_log set job_id = p_keep where job_id = p_other;
  update public.lab_invoice_orders set job_id = p_keep where job_id = p_other;
  update public.support_conversations set job_id = p_keep where job_id = p_other;
  update public.season_offers set last_job_id = p_keep where last_job_id = p_other;

  insert into public.job_contacts (job_id, contact_id, company_id, role)
  select p_keep, c.contact_id, c.company_id, c.role from public.job_contacts c where c.job_id = p_other
  on conflict (job_id, contact_id) do nothing;

  -- Outside links: the kept job's own win, the other job's fill the gaps.
  insert into public.job_links (job_id, company_id, captura_gallery_id, online_shop_url, drive_folder_url, notion_page_url)
  select p_keep, l.company_id, l.captura_gallery_id, l.online_shop_url, l.drive_folder_url, l.notion_page_url
    from public.job_links l where l.job_id = p_other
  on conflict (job_id) do update set
    captura_gallery_id = coalesce(public.job_links.captura_gallery_id, excluded.captura_gallery_id),
    online_shop_url    = coalesce(public.job_links.online_shop_url, excluded.online_shop_url),
    drive_folder_url   = coalesce(public.job_links.drive_folder_url, excluded.drive_folder_url),
    notion_page_url    = coalesce(public.job_links.notion_page_url, excluded.notion_page_url);

  update public.jobs j set
    expected_teams    = coalesce(j.expected_teams, v_other.expected_teams),
    expected_subjects = coalesce(j.expected_subjects, v_other.expected_subjects),
    lab               = coalesce(j.lab, v_other.lab),
    venue             = coalesce(j.venue, v_other.venue),
    promo             = coalesce(j.promo, v_other.promo),
    coupon            = coalesce(j.coupon, v_other.coupon),
    team_photo_type   = coalesce(j.team_photo_type, v_other.team_photo_type),
    notes = concat_ws(E'\n\n', nullif(j.notes, ''),
      'Combined with ' || v_other.name || coalesce(' (' || v_days || ')', '') || ' on ' || to_char(now(), 'Mon FMDD, YYYY') || '.'
      || coalesce(E'\n' || nullif(v_other.notes, ''), ''))
  where j.id = p_keep;

  delete from public.jobs where id = p_other;
end $$;

revoke all on function private.combine_jobs_inner(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function private.combine_jobs_inner(uuid, uuid, uuid) to service_role;

create or replace function public.combine_jobs(p_keep uuid, p_other uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_company uuid := private.current_company_id();
begin
  if v_company is null or not private.can_edit_ops() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform private.combine_jobs_inner(v_company, p_keep, p_other);
end $$;

revoke all on function public.combine_jobs(uuid, uuid) from public, anon;
grant execute on function public.combine_jobs(uuid, uuid) to authenticated;
