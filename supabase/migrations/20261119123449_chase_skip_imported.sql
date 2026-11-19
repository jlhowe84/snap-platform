-- Jobs imported from Notion stay out of the chase until cutover (Josh,
-- 2026-11-19). Their planning lives in Notion, so here they look like they are
-- missing everything. The setting chase.include_imported (true or false,
-- absent means false) lets them in at cutover.

create or replace function public.clock_due(p_company uuid, p_today date)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_items     jsonb := '[]'::jsonb;
  v_remind    int := private.setting_number(p_company, 'holds.reminder_days', 5)::int;
  v_weeks_due int := private.setting_number(p_company, 'chase.weeks_due', 3)::int;
  v_assignee  uuid;
  v_steps     text[] := array['request', 'reminder', 'due_soon', 'at_risk'];
  v_weeks     int[];
  r           record;
  v_imported  boolean;
  v_step      int;
  v_missing   text[];
  v_key       text;
begin
  if auth.uid() is not null then
    raise exception 'the daily clock runs from the server only';
  end if;
  v_weeks := array[
    private.setting_number(p_company, 'chase.weeks_request', 8)::int,
    private.setting_number(p_company, 'chase.weeks_reminder', 5)::int,
    private.setting_number(p_company, 'chase.weeks_due_soon', 4)::int,
    private.setting_number(p_company, 'chase.weeks_at_risk', 3)::int];
  select (value #>> '{}')::uuid into v_assignee from public.settings
  where company_id = p_company and key = 'chase.call_assignee' and jsonb_typeof(value) = 'string';

  -- 1. Lapsed holds release. The date goes back on the board.
  for r in
    select h.id, h.job_id from public.date_holds h
    where h.company_id = p_company and h.status = 'held' and h.expires_on < p_today
  loop
    perform public.release_hold(r.id, 'Hold lapsed with no answer', 'no_reply');
    insert into public.clock_log (company_id, key, kind, job_id, outcome, run_on)
    values (p_company, 'release:' || r.id, 'hold.release', r.job_id, 'released', p_today)
    on conflict (company_id, key) do nothing;
  end loop;

  -- 2. Reminders before a hold releases, once per window (an extension
  --    moves expires_on, so it earns a new reminder).
  for r in
    select h.id, h.job_id, h.expires_on, j.org_id
    from public.date_holds h join public.jobs j on j.id = h.job_id
    where h.company_id = p_company and h.status = 'held'
      and h.expires_on - p_today <= v_remind
  loop
    v_key := 'hold_reminder:' || r.id || ':' || r.expires_on;
    if not exists (select 1 from public.clock_log where company_id = p_company and key = v_key) then
      v_items := v_items || jsonb_build_object('kind', 'holds.remind', 'key', v_key, 'job_id', r.job_id,
        'org_id', r.org_id, 'hold_id', r.id, 'expires_on', r.expires_on);
    end if;
  end loop;

  -- 3. The chase, on each confirmed job's own clock. Jobs imported from
  --    Notion are planned in Notion until cutover, so they stay out unless
  --    the company turns chase.include_imported on. They are skipped with no
  --    log row, so the right step is drafted once they are let in.
  select coalesce((select value = 'true'::jsonb from public.settings
                   where company_id = p_company and key = 'chase.include_imported'), false)
    into v_imported;

  for r in
    select j.id as job_id, j.org_id, j.name, min(pd.date) as first_date
    from public.jobs j join public.photo_days pd on pd.job_id = j.id
    where j.company_id = p_company and j.status = 'planning' and pd.date >= p_today
      and (v_imported or j.notion_page_id is null)
    group by j.id
  loop
    -- The latest step whose time has come.
    v_step := null;
    for i in reverse 4..1 loop
      if r.first_date - p_today <= v_weeks[i] * 7 then
        v_step := i;
        exit;
      end if;
    end loop;
    continue when v_step is null;
    v_key := 'chase:' || r.job_id || ':' || v_steps[v_step];
    continue when exists (select 1 from public.clock_log where company_id = p_company and key = v_key);

    -- Earlier steps never sent are skipped, not sent late.
    for i in 1..v_step - 1 loop
      insert into public.clock_log (company_id, key, kind, job_id, outcome, run_on)
      values (p_company, 'chase:' || r.job_id || ':' || v_steps[i], 'chase.' || v_steps[i], r.job_id, 'skipped', p_today)
      on conflict (company_id, key) do nothing;
    end loop;

    v_missing := coalesce(private.job_missing(r.job_id), '{}');
    if cardinality(v_missing) = 0 then
      insert into public.clock_log (company_id, key, kind, job_id, outcome, missing, run_on)
      values (p_company, v_key, 'chase.' || v_steps[v_step], r.job_id, 'not_needed', v_missing, p_today);
      continue;
    end if;

    if v_steps[v_step] = 'due_soon' and not exists (
         select 1 from public.clock_log where company_id = p_company and key = 'chase:' || r.job_id || ':call') then
      insert into public.tasks (company_id, job_id, org_id, title, notes, assignee_id, due_on)
      values (p_company, r.job_id, r.org_id, 'Call ' || r.name || ' about what is missing',
              'Still missing: ' || array_to_string(v_missing, ', ') || '. Due ' ||
              to_char(r.first_date - v_weeks_due * 7, 'Mon DD') || '.',
              v_assignee, p_today + 1);
      insert into public.clock_log (company_id, key, kind, job_id, outcome, missing, run_on)
      values (p_company, 'chase:' || r.job_id || ':call', 'chase.call', r.job_id, 'task', v_missing, p_today);
    end if;

    v_items := v_items || jsonb_build_object('kind', 'chase.' || v_steps[v_step], 'key', v_key,
      'job_id', r.job_id, 'org_id', r.org_id, 'first_date', r.first_date,
      'due_on', r.first_date - v_weeks_due * 7, 'missing', to_jsonb(v_missing));
  end loop;

  return v_items;
end;
$$;
revoke all on function public.clock_due(uuid, date) from public, anon, authenticated;
grant execute on function public.clock_due(uuid, date) to service_role;
