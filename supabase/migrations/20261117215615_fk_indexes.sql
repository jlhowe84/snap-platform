-- Covering indexes for foreign keys (Supabase performance advisor), and the
-- pause check runs with the caller's rights so RLS decides who can see pauses.
create index agent_actions_actor_idx on public.agent_actions (actor_id);
create index agent_actions_type_idx on public.agent_actions (company_id, action_type_key);
create index agent_actions_decided_by_idx on public.agent_actions (decided_by);
create index agent_actions_run_idx on public.agent_actions (run_id);
create index agent_pauses_lifted_by_idx on public.agent_pauses (lifted_by);
create index agent_pauses_paused_by_idx on public.agent_pauses (paused_by);
create index job_contacts_company_idx on public.job_contacts (company_id);
create index job_contacts_contact_idx on public.job_contacts (contact_id);
create index job_coordinators_company_idx on public.job_coordinators (company_id);
create index job_links_company_idx on public.job_links (company_id);
create index league_notes_author_idx on public.league_notes (author_id);
create index league_notes_company_idx on public.league_notes (company_id);
create index organization_contacts_company_idx on public.organization_contacts (company_id);
create index organization_terms_company_idx on public.organization_terms (company_id);
create index tasks_completed_by_idx on public.tasks (completed_by);
create index tasks_created_by_idx on public.tasks (created_by);
create index tasks_org_idx on public.tasks (org_id);
create index tasks_playbook_step_idx on public.tasks (playbook_step_id);

alter function public.agent_is_paused(uuid, text) security invoker;
