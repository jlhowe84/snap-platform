-- The date change cascade (module 3). Postponing, rescheduling or cancelling a
-- photo day is one action, change_photo_day(), decided by an owner or admin.
-- It keeps the original date, records the change, frees or takes stations on
-- the capacity board, restarts the chase clock, withdraws chase drafts written
-- for the old date, queues a notice to the coordinator for approval, and
-- leaves tasks for the steps a person still does by hand (Captura, calendar).
-- Crew shifts, kits and parent notices join the cascade when those modules land.

alter table public.photo_days
  add column status text not null default 'scheduled'
    check (status in ('scheduled', 'postponed', 'cancelled'));

create table public.date_changes (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  job_id        uuid not null references public.jobs(id) on delete cascade,
  photo_day_id  uuid not null references public.photo_days(id) on delete cascade,
  kind          text not null check (kind in ('reschedule', 'postpone', 'cancel')),
  from_date     date not null,
  to_date       date,
  reason        text not null check (length(btrim(reason)) > 0),
  decided_by    uuid references public.profiles(id) on delete set null,
  notice_id     uuid references public.agent_actions(id) on delete set null,
  created_at    timestamptz not null default now(),
  check ((kind = 'reschedule') = (to_date is not null))
);
create index date_changes_job_idx on public.date_changes (job_id, created_at desc);
create index date_changes_company_idx on public.date_changes (company_id);
create index date_changes_photo_day_idx on public.date_changes (photo_day_id);
create index date_changes_decided_by_idx on public.date_changes (decided_by);
create index date_changes_notice_idx on public.date_changes (notice_id);

alter table public.date_changes enable row level security;
grant select on public.date_changes to authenticated;
grant all on public.date_changes to service_role;
-- Staff read; rows are written only by change_photo_day().
create policy date_changes_select on public.date_changes for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_staff()));
create trigger date_changes_log after insert on public.date_changes
  for each row execute function private.log_row_change();

-- A signed-in person cannot move or cancel a photo day by editing the row:
-- the date and status change only through change_photo_day(), so no step of
-- the cascade is skipped. Server jobs (the Notion import) are not affected.
create or replace function private.guard_photo_day_date()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.date, new.status) is distinct from (old.date, old.status)
     and auth.uid() is not null
     and coalesce(current_setting('app.date_change', true), '') <> '1' then
    raise exception 'use Change date on the job page to move, postpone or cancel a photo day';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_photo_day_date() from public;
create trigger photo_days_date_guard before update on public.photo_days
  for each row execute function private.guard_photo_day_date();

-- Only scheduled days take stations.
create or replace view public.date_capacity with (security_invoker = true) as
select
  pd.company_id,
  pd.date,
  sum(pd.stations)::int                                         as stations_used,
  sum(pd.stations) filter (where j.status = 'held')::int        as stations_held,
  count(distinct j.id)::int                                     as jobs
from public.photo_days pd
join public.jobs j on j.id = pd.job_id
where j.status not in ('released', 'cancelled') and pd.status = 'scheduled'
group by pd.company_id, pd.date;

create or replace function public.change_photo_day(
  p_photo_day uuid,
  p_kind      text,
  p_new_date  date default null,
  p_reason    text default null,
  p_notice    jsonb default null,
  p_override  boolean default false
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_company  uuid := private.current_company_id();
  v_day      public.photo_days%rowtype;
  v_job      public.jobs%rowtype;
  v_change   uuid;
  v_notice   uuid;
  v_capacity int;
  v_used     int;
  v_summary  text;
  v_old      text;
begin
  if not private.is_owner_or_admin() then
    raise exception 'moving, postponing or cancelling a photo day is for an owner or admin';
  end if;
  if p_kind is null or p_kind not in ('reschedule', 'postpone', 'cancel') then
    raise exception 'pick reschedule, postpone or cancel';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'a date change needs a reason';
  end if;

  select * into v_day from public.photo_days
  where id = p_photo_day and company_id = v_company
  for update;
  if not found then
    raise exception 'photo day not found';
  end if;
  select * into v_job from public.jobs where id = v_day.job_id;
  if v_day.status = 'cancelled' then
    raise exception 'this photo day is already cancelled';
  end if;
  if v_job.status in ('released', 'cancelled') then
    raise exception 'this job is no longer live';
  end if;
  if p_kind = 'cancel' and v_job.status = 'held' then
    raise exception 'this date is only held: release the hold instead';
  end if;
  if p_kind = 'postpone' and v_day.status = 'postponed' then
    raise exception 'this photo day is already postponed';
  end if;

  if p_kind = 'reschedule' then
    if p_new_date is null then
      raise exception 'a rescheduled photo day needs its new date';
    end if;
    if p_new_date = v_day.date and v_day.status = 'scheduled' then
      raise exception 'that is already the date';
    end if;
    v_capacity := private.setting_number(v_company, 'capacity.stations_per_date', 10)::int;
    select coalesce(sum(pd.stations), 0) into v_used
    from public.photo_days pd join public.jobs j on j.id = pd.job_id
    where pd.company_id = v_company and pd.date = p_new_date and pd.id <> v_day.id
      and pd.status = 'scheduled' and j.status not in ('released', 'cancelled');
    if v_used + v_day.stations > v_capacity and not p_override then
      raise exception '% is full: % of % stations taken', p_new_date, v_used, v_capacity;
    end if;
  else
    p_new_date := null;
  end if;

  -- The notice waits in the approval queue like any other draft.
  if p_notice is not null then
    insert into public.action_types (company_id, key, description, kind, autonomy_level)
    values (v_company, 'dates.notify', 'Tell a league its photo day changed', 'propose', 1)
    on conflict (company_id, key) do nothing;
    insert into public.agent_actions (company_id, action_type_key, actor_kind, status, draft, record_refs)
    values (v_company, 'dates.notify', 'system', 'proposed',
            jsonb_build_object('to', coalesce(p_notice -> 'to', '[]'::jsonb),
                               'subject', left(p_notice ->> 'subject', 300),
                               'body', left(p_notice ->> 'body', 20000)),
            jsonb_build_object('job_id', v_job.id, 'org_id', v_job.org_id, 'photo_day_id', v_day.id))
    returning id into v_notice;
  end if;

  insert into public.date_changes (company_id, job_id, photo_day_id, kind, from_date, to_date, reason, decided_by, notice_id)
  values (v_company, v_job.id, v_day.id, p_kind, v_day.date, p_new_date, btrim(p_reason), auth.uid(), v_notice)
  returning id into v_change;

  perform set_config('app.date_change', '1', true);
  update public.photo_days
  set original_date = coalesce(original_date, date),
      date = coalesce(p_new_date, date),
      status = case p_kind when 'reschedule' then 'scheduled' when 'postpone' then 'postponed' else 'cancelled' end
  where id = v_day.id;
  perform set_config('app.date_change', '', true);

  -- A job with every photo day cancelled is cancelled.
  if p_kind = 'cancel' and not exists (
       select 1 from public.photo_days where job_id = v_job.id and status <> 'cancelled') then
    update public.jobs set status = 'cancelled' where id = v_job.id;
  end if;

  -- The chase restarts from the new date: the old steps keep their rows under
  -- a retired key, and drafts written for the old date are withdrawn.
  update public.clock_log
  set key = key || ':before:' || v_change
  where company_id = v_company and job_id = v_job.id and key like 'chase:%' and key not like '%:before:%';
  update public.agent_actions
  set status = 'rejected', decided_by = auth.uid(), decided_at = now(),
      decision_note = 'Withdrawn: the photo day changed'
  where company_id = v_company and status = 'proposed' and action_type_key like 'chase.%'
    and record_refs ->> 'job_id' = v_job.id::text;

  v_old := to_char(v_day.date, 'Dy Mon DD, YYYY');
  v_summary := case p_kind
    when 'reschedule' then format('Photo day moved from %s to %s', v_old, to_char(p_new_date, 'Dy Mon DD, YYYY'))
    when 'postpone'   then format('Photo day on %s postponed, new date to come', v_old)
    else                   format('Photo day on %s cancelled', v_old) end;

  insert into public.touchpoints (company_id, org_id, job_id, channel, direction, summary, outcome, actor_id, actor_kind, source_ref)
  values (v_company, v_job.org_id, v_job.id, 'note', 'internal', v_summary || ': ' || btrim(p_reason), p_kind,
          auth.uid(), 'person', jsonb_build_object('date_change_id', v_change));

  -- What a person still does by hand.
  insert into public.tasks (company_id, job_id, org_id, title, notes, due_on, created_by) values
    (v_company, v_job.id, v_job.org_id, 'Update Captura: ' || v_job.name,
     v_summary || '. Change by hand in Captura: the photo day date on the job, the extra dates marketing field and the prepay close date. Check the welcome message, the QR sign and the flyer for the old date.',
     current_date + 1, auth.uid()),
    (v_company, v_job.id, v_job.org_id, 'Update the calendar: ' || v_job.name,
     v_summary || '. Move or remove the calendar event and tell the crew booked for it.',
     current_date + 1, auth.uid());

  return v_change;
end;
$$;
revoke all on function public.change_photo_day(uuid, text, date, text, jsonb, boolean) from public, anon;
grant execute on function public.change_photo_day(uuid, text, date, text, jsonb, boolean) to authenticated;

-- The chase runs only for scheduled photo days.
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
      and pd.status = 'scheduled'
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
