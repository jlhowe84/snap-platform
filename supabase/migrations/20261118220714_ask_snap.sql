-- Ask SNAP: staff ask a question, the server answers it from records the
-- asker may already read. Every question is one row in agent_runs, and the
-- day's spend is checked against a cap before the model is called.
--
-- The cap is a setting (agent.daily_budget_usd, whole dollars, 0 = off). The
-- existing agent.monthly_budget_usd is honored too when it holds a number.

insert into public.settings (company_id, key, value)
select id, 'agent.daily_budget_usd', '2'::jsonb from public.companies
on conflict (company_id, key) do nothing;

insert into public.settings (company_id, key, value)
select id, 'agent.model', '"claude-haiku-5-5"'::jsonb from public.companies
on conflict (company_id, key) do nothing;

-- What the agent has spent today and this month, in the company's time zone.
create or replace function private.agent_spend(p_company uuid, out today numeric, out month numeric)
language sql stable security definer set search_path = '' as $$
  select
    coalesce(sum(r.cost_usd) filter (
      where (r.started_at at time zone c.time_zone)::date = (now() at time zone c.time_zone)::date), 0),
    coalesce(sum(r.cost_usd), 0)
  from public.companies c
  left join public.agent_runs r
    on r.company_id = c.id
   and r.started_at >= (date_trunc('month', now() at time zone c.time_zone) at time zone c.time_zone)
  where c.id = p_company
  group by c.id
$$;
revoke all on function private.agent_spend(uuid) from public;

-- Staff see where the day stands (the Ask SNAP page shows it).
create or replace function public.ask_snap_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_company uuid := private.current_company_id();
  v_spend   record;
begin
  if v_company is null or not private.is_staff() then
    raise exception 'Ask SNAP is for staff';
  end if;
  select * into v_spend from private.agent_spend(v_company);
  return jsonb_build_object(
    'daily_cap', private.setting_number(v_company, 'agent.daily_budget_usd', 0),
    'monthly_cap', private.setting_number(v_company, 'agent.monthly_budget_usd', null),
    'spent_today', coalesce(v_spend.today, 0),
    'spent_month', coalesce(v_spend.month, 0));
end;
$$;
revoke all on function public.ask_snap_status() from public, anon;
grant execute on function public.ask_snap_status() to authenticated;

-- Opens a run for one question. Returns the run id, or the reason there is
-- none: 'off' (cap is 0), 'day' or 'month' (cap reached), 'busy' (this person
-- already has a question running).
create or replace function public.ask_snap_begin(p_question text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.current_company_id();
  v_me      uuid := (select auth.uid());
  v_day     numeric;
  v_month   numeric;
  v_spend   record;
  v_id      uuid;
begin
  if v_company is null or v_me is null or not private.is_staff() then
    raise exception 'Ask SNAP is for staff';
  end if;
  if p_question is null or length(btrim(p_question)) = 0 or length(p_question) > 2000 then
    raise exception 'a question is 1 to 2000 characters';
  end if;

  v_day := private.setting_number(v_company, 'agent.daily_budget_usd', 0);
  v_month := private.setting_number(v_company, 'agent.monthly_budget_usd', null);
  if v_day <= 0 then return jsonb_build_object('stop', 'off'); end if;

  -- A run that never reported back (a crashed request) stops counting as
  -- running after five minutes.
  update public.agent_runs set status = 'failed', error = 'no result was recorded', finished_at = now()
  where company_id = v_company and trigger = 'ask_snap' and status = 'running'
    and started_at < now() - interval '5 minutes';

  if exists (select 1 from public.agent_runs
             where company_id = v_company and trigger = 'ask_snap' and status = 'running'
               and input ->> 'asked_by' = v_me::text) then
    return jsonb_build_object('stop', 'busy');
  end if;

  select * into v_spend from private.agent_spend(v_company);
  if coalesce(v_spend.today, 0) >= v_day then return jsonb_build_object('stop', 'day'); end if;
  if v_month is not null and coalesce(v_spend.month, 0) >= v_month then
    return jsonb_build_object('stop', 'month');
  end if;

  insert into public.agent_runs (company_id, trigger, status, input)
  values (v_company, 'ask_snap', 'running', jsonb_build_object('asked_by', v_me, 'question', p_question))
  returning id into v_id;

  return jsonb_build_object(
    'run_id', v_id,
    'left_usd', least(v_day - coalesce(v_spend.today, 0),
                      coalesce(v_month - coalesce(v_spend.month, 0), v_day)));
end;
$$;
revoke all on function public.ask_snap_begin(text) from public, anon;
grant execute on function public.ask_snap_begin(text) to authenticated;

-- Closes the asker's own running question with what it cost.
create or replace function public.ask_snap_finish(
  p_run_id uuid, p_ok boolean, p_model text, p_answer text, p_tool_calls int,
  p_input_tokens int, p_output_tokens int, p_cost_usd numeric, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
begin
  if p_cost_usd is null or p_cost_usd < 0 or p_cost_usd > 5 then
    raise exception 'that cost cannot be right';
  end if;
  update public.agent_runs set
    status = case when p_ok then 'succeeded' else 'failed' end,
    model = left(p_model, 100),
    output = case when p_answer is null then null else jsonb_build_object('answer', left(p_answer, 20000)) end,
    tool_calls = greatest(coalesce(p_tool_calls, 0), 0),
    input_tokens = greatest(coalesce(p_input_tokens, 0), 0),
    output_tokens = greatest(coalesce(p_output_tokens, 0), 0),
    cost_usd = p_cost_usd,
    error = left(p_error, 500),
    finished_at = now()
  where id = p_run_id
    and company_id = private.current_company_id()
    and trigger = 'ask_snap' and status = 'running'
    and input ->> 'asked_by' = v_me::text;
  if not found then
    raise exception 'that question is not yours to close';
  end if;
end;
$$;
revoke all on function public.ask_snap_finish(uuid, boolean, text, text, int, int, int, numeric, text) from public, anon;
grant execute on function public.ask_snap_finish(uuid, boolean, text, text, int, int, int, numeric, text) to authenticated;
