-- =============================================================================
-- Production board (spec module 10, first piece). A job's production stage is
-- worked out from its production tasks and never typed: it is the stage of the
-- first step, in playbook order, that is still open. When every staged step
-- is closed the stage is Complete and the job moves to the lab.
-- =============================================================================

alter table public.jobs
  add column production_started_at  timestamptz,
  add column production_stage_since timestamptz;

-- A step's stage as the playbook writes it ("Gallery Prep", "QA/Marketing").
create or replace function private.production_stage_of(p_text text)
returns public.production_stage
language sql immutable set search_path = '' as $$
  select case lower(regexp_replace(coalesce(p_text, ''), '[^A-Za-z]', '', 'g'))
           when 'import' then 'import'
           when 'editing' then 'editing'
           when 'upload' then 'upload'
           when 'composites' then 'composites'
           when 'galleryprep' then 'gallery_prep'
           when 'qamarketing' then 'qa_marketing'
         end::public.production_stage
$$;

-- Sets one job's stage from its tasks. A job with no staged production tasks
-- is left as it is, so imported jobs keep the stage they came with.
create or replace function private.refresh_production_stage(p_job uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_total int;
  v_stage public.production_stage;
begin
  select count(*),
         (array_agg(private.production_stage_of(s.stage) order by s.position, t.created_at)
            filter (where t.status <> 'done'))[1]
    into v_total, v_stage
    from public.tasks t
    join public.playbook_steps s on s.id = t.playbook_step_id
    join public.playbooks p on p.id = s.playbook_id
   where t.job_id = p_job
     and p.kind = 'production'
     and t.status <> 'cancelled'
     and private.production_stage_of(s.stage) is not null;
  if v_total = 0 then
    return;
  end if;
  v_stage := coalesce(v_stage, 'complete');
  update public.jobs
     set production_stage = v_stage,
         production_stage_since = now(),
         status = case
                    when v_stage = 'complete' and status = 'in_production' then 'at_lab'
                    when v_stage <> 'complete' and status = 'at_lab' and production_started_at is not null then 'in_production'
                    else status
                  end
   where id = p_job
     and production_stage is distinct from v_stage;
end $$;

create or replace function private.tasks_production_stage()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.job_id is not null and old.playbook_step_id is not null then
    perform private.refresh_production_stage(old.job_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.job_id is not null and new.playbook_step_id is not null
     and (tg_op = 'INSERT' or new.job_id is distinct from old.job_id or old.playbook_step_id is null) then
    perform private.refresh_production_stage(new.job_id);
  end if;
  return null;
end $$;

create trigger tasks_production_stage
  after insert or delete or update of status, job_id, playbook_step_id on public.tasks
  for each row execute function private.tasks_production_stage();

-- Starting production gives the job one task for every active step of the
-- company's production playbooks that it does not have yet. Due dates count
-- from the job's last photo day. Ops editors only.
create or replace function public.start_production(p_job uuid)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.current_company_id();
  v_last date;
  v_added int;
begin
  if v_company is null or not private.can_edit_ops() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.jobs where id = p_job and company_id = v_company and status in ('planning', 'in_production')) then
    raise exception 'this job cannot start production' using errcode = '22023';
  end if;
  select max(date) into v_last from public.photo_days where job_id = p_job;

  update public.jobs
     set status = 'in_production', production_started_at = coalesce(production_started_at, now())
   where id = p_job;

  insert into public.tasks (company_id, job_id, playbook_step_id, title, due_on, created_by)
  select v_company, p_job, s.id, s.name,
         case when v_last is not null and s.offset_days is not null then v_last + s.offset_days end,
         auth.uid()
    from public.playbook_steps s
    join public.playbooks p on p.id = s.playbook_id
   where p.company_id = v_company and p.kind = 'production' and p.active and s.active
     and not exists (select 1 from public.tasks t where t.job_id = p_job and t.playbook_step_id = s.id)
   order by s.position;
  get diagnostics v_added = row_count;
  return v_added;
end $$;

revoke all on function public.start_production(uuid) from public, anon;
grant execute on function public.start_production(uuid) to authenticated;
