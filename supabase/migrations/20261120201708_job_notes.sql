-- Job notes: a dated log on each job. Every entry keeps who wrote it and
-- when. Staff read; owner, admin and office write; the author or an owner or
-- admin may delete an entry. Crew, coordinators and anonymous see none of it.
create table public.job_notes (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  job_id      uuid not null references public.jobs(id) on delete cascade,
  body        text not null check (length(btrim(body)) between 1 and 5000),
  author_id   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index job_notes_job_idx on public.job_notes (job_id, created_at desc);
create index job_notes_company_idx on public.job_notes (company_id);
create index job_notes_author_idx on public.job_notes (author_id);

create trigger job_notes_log after insert or update or delete on public.job_notes
  for each row execute function private.log_row_change();

alter table public.job_notes enable row level security;
grant select, insert, delete on public.job_notes to authenticated;
grant all on public.job_notes to service_role;

create policy job_notes_select on public.job_notes for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_staff()));
create policy job_notes_insert on public.job_notes for insert to authenticated
  with check (company_id = (select private.current_company_id())
              and (select private.can_edit_ops())
              and author_id = (select auth.uid())
              and exists (select 1 from public.jobs j where j.id = job_id and j.company_id = job_notes.company_id));
create policy job_notes_delete on public.job_notes for delete to authenticated
  using (company_id = (select private.current_company_id())
         and (select private.can_edit_ops())
         and (author_id = (select auth.uid()) or (select private.is_owner_or_admin())));

-- Combining jobs brings the other job's notes along. They move first; if the
-- combine is then refused, the whole call rolls back and they stay put.
create or replace function public.combine_jobs(p_keep uuid, p_other uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_company uuid := private.current_company_id();
begin
  if v_company is null or not private.can_edit_ops() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_keep is distinct from p_other
     and exists (select 1 from public.jobs where id = p_keep and company_id = v_company) then
    update public.job_notes set job_id = p_keep where job_id = p_other and company_id = v_company;
  end if;
  perform private.combine_jobs_inner(v_company, p_keep, p_other);
end $$;

revoke all on function public.combine_jobs(uuid, uuid) from public, anon;
grant execute on function public.combine_jobs(uuid, uuid) to authenticated;
