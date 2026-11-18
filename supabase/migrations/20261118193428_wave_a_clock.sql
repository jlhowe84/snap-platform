-- =============================================================================
-- Wave A, the daily clock and the approval queue (modules 2, 4 and 18).
--
-- clock_due(company, today) runs once a day from the server (service role):
--   * releases holds whose window has lapsed,
--   * returns the hold reminders due (holds.reminder_days before release),
--   * returns each confirmed job's chase step on its own clock, counted back
--     from its first photo day: 8 weeks the request, 5 weeks a reminder of
--     what is missing, 4 weeks "due in one week" plus a call task, 3 weeks the
--     date-at-risk alert. Weeks are settings.
-- The server turns each item into a drafted action in the approval queue.
-- clock_log makes every step happen once per job (or once per hold window).
-- decide_action records a person's approve, edit or reject and keeps each
-- action type's clean streak (earned autonomy).
-- =============================================================================

create table public.clock_log (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  key         text not null,
  kind        text not null,
  job_id      uuid references public.jobs(id) on delete cascade,
  outcome     text not null check (outcome in ('queued', 'skipped', 'not_needed', 'released', 'task')),
  missing     text[],
  action_id   uuid references public.agent_actions(id) on delete set null,
  run_on      date not null,
  created_at  timestamptz not null default now(),
  unique (company_id, key)
);
create index clock_log_job_idx on public.clock_log (job_id);
create index clock_log_action_idx on public.clock_log (action_id);

alter table public.clock_log enable row level security;
grant select on public.clock_log to authenticated;
grant all on public.clock_log to service_role;
create policy clock_log_select on public.clock_log for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_staff()));

-- Defaults for every company: the queue's action types and the clock settings.
create or replace function private.seed_clock_defaults(p_company uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.action_types (company_id, key, description, kind, autonomy_level) values
    (p_company, 'offers.send',    'Send a league its season offer', 'propose', 1),
    (p_company, 'holds.remind',   'Remind a league its held date releases soon', 'propose', 1),
    (p_company, 'chase.request',  'Ask for the planning form, roster and schedule', 'propose', 1),
    (p_company, 'chase.reminder', 'Remind a league what is still missing', 'propose', 1),
    (p_company, 'chase.due_soon', 'Tell a league its items are due in one week', 'propose', 1),
    (p_company, 'chase.at_risk',  'Date-at-risk note to a league (Josh decides)', 'propose', 1)
  on conflict (company_id, key) do nothing;

  insert into public.settings (company_id, key, value) values
    (p_company, 'clock.enabled',        'false'::jsonb),  -- the daily run waits for the owner to turn it on
    (p_company, 'holds.reminder_days',  '5'::jsonb),
    (p_company, 'chase.weeks_request',  '8'::jsonb),
    (p_company, 'chase.weeks_reminder', '5'::jsonb),
    (p_company, 'chase.weeks_due_soon', '4'::jsonb),
    (p_company, 'chase.weeks_at_risk',  '3'::jsonb),
    (p_company, 'chase.weeks_due',      '3'::jsonb),
    (p_company, 'chase.call_assignee',  'null'::jsonb)
  on conflict (company_id, key) do nothing;
end;
$$;
revoke all on function private.seed_clock_defaults(uuid) from public, authenticated;

do $$
declare c uuid;
begin
  for c in select id from public.companies loop
    perform private.seed_clock_defaults(c);
  end loop;
end $$;

-- What a job still owes, in plain words, from the readiness view.
create or replace function private.job_missing(p_job uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select array_remove(array[
    case when bool_or(not r.agreement_signed) then 'agreement' end,
    case when bool_or(r.planning_form <> 'submitted') then 'planning_form' end,
    case when bool_or(r.roster = 'not_received') then 'roster' end,
    case when bool_or(r.schedule not in ('submitted', 'complete')) then 'schedule' end
  ], null)
  from public.photo_day_readiness r
  where r.job_id = p_job
$$;
revoke all on function private.job_missing(uuid) from public;

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

  -- 3. The chase, on each confirmed job's own clock.
  for r in
    select j.id as job_id, j.org_id, j.name, min(pd.date) as first_date
    from public.jobs j join public.photo_days pd on pd.job_id = j.id
    where j.company_id = p_company and j.status = 'planning' and pd.date >= p_today
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

-- A person's decision on a queued action. Approving unedited grows the type's
-- clean streak; an edit or a rejection resets it. The date-at-risk note is
-- Josh's call, so only an owner or admin decides it.
create or replace function public.decide_action(
  p_action_id uuid,
  p_approve   boolean,
  p_draft     jsonb default null,
  p_note      text default null
)
returns public.action_status
language plpgsql security definer set search_path = '' as $$
declare
  v_action public.agent_actions%rowtype;
  v_edited boolean;
  v_status public.action_status;
begin
  if not private.is_staff() then
    raise exception 'only staff decide queued actions';
  end if;
  select * into v_action from public.agent_actions
  where id = p_action_id and company_id = private.current_company_id()
  for update;
  if not found then
    raise exception 'action not found';
  end if;
  if v_action.status <> 'proposed' then
    raise exception 'this action was already decided';
  end if;
  if v_action.action_type_key = 'chase.at_risk' and not private.is_owner_or_admin() then
    raise exception 'a date-at-risk note is for an owner or admin to decide';
  end if;

  v_edited := p_approve and p_draft is not null and p_draft is distinct from v_action.draft;
  v_status := case when not p_approve then 'rejected' when v_edited then 'edited' else 'approved' end;

  update public.agent_actions
  set status = v_status,
      draft = case when v_edited then p_draft else draft end,
      decided_by = auth.uid(), decided_at = now(),
      decision_note = left(p_note, 500)
  where id = p_action_id;

  update public.action_types
  set clean_streak = case when v_status = 'approved' then clean_streak + 1 else 0 end
  where company_id = v_action.company_id and key = v_action.action_type_key;
  return v_status;
end;
$$;
revoke all on function public.decide_action(uuid, boolean, jsonb, text) from public, anon;
grant execute on function public.decide_action(uuid, boolean, jsonb, text) to authenticated;
