-- =============================================================================
-- Wave A, coordinator portal (module 14) and signing (module 2).
--
-- A portal link is one per job, reusable until it expires. Opening it runs on
-- the server with the service role: portal_link_lookup() finds the link's
-- contact, the server makes sure an auth user exists for that email, and
-- portal_admit() links that person to the job as a coordinator. The server
-- then mints a normal Supabase session, so the same RLS applies everywhere.
-- A link never opens a session for a staff email.
--
-- sign_agreement() is the only way a signature is written. Signing confirms
-- the hold: the hold row, the job (held to planning) and the season offer.
-- =============================================================================

-- Finds a live link by the hash of its token. Server only.
create or replace function public.portal_link_lookup(p_token_hash text)
returns table (link_id uuid, job_id uuid, company_id uuid, email text, full_name text, profile_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_email text;
begin
  select lower(c.email) into v_email
  from public.portal_links l
  join public.contacts c on c.id = l.contact_id
  where l.token_hash = p_token_hash;

  if v_email is not null and exists (
    select 1 from public.profiles p
    join public.profile_roles r on r.profile_id = p.id
    where lower(p.email) = v_email and r.role <> 'coordinator'
  ) then
    raise exception 'portal links cannot open a staff account' using errcode = 'P0001';
  end if;

  return query
  select l.id, l.job_id, l.company_id, lower(c.email), c.full_name,
         (select p.id from public.profiles p where lower(p.email) = lower(c.email) limit 1)
  from public.portal_links l
  join public.contacts c on c.id = l.contact_id
  where l.token_hash = p_token_hash
    and l.revoked_at is null
    and l.expires_at > now()
    and c.email is not null and c.email like '%@%';
end;
$$;
revoke all on function public.portal_link_lookup(text) from public, anon, authenticated;
grant execute on function public.portal_link_lookup(text) to service_role;

-- Links the person to the link's job as a coordinator. Server only.
create or replace function public.portal_admit(p_link_id uuid, p_profile_id uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_link    public.portal_links%rowtype;
  v_email   text;
  v_profile public.profiles%rowtype;
begin
  select * into v_link from public.portal_links
  where id = p_link_id and revoked_at is null and expires_at > now();
  if not found then
    raise exception 'portal link is not valid';
  end if;

  select lower(email) into v_email from public.contacts where id = v_link.contact_id;
  select * into v_profile from public.profiles where id = p_profile_id;
  if v_profile.id is null or v_email is null or lower(v_profile.email) <> v_email then
    raise exception 'portal link belongs to a different person';
  end if;
  if exists (select 1 from public.profile_roles where profile_id = p_profile_id and role <> 'coordinator') then
    raise exception 'portal links cannot open a staff account';
  end if;
  if v_profile.company_id is not null and v_profile.company_id <> v_link.company_id then
    raise exception 'this person belongs to another company';
  end if;

  if v_profile.company_id is null then
    update public.profiles set company_id = v_link.company_id where id = p_profile_id;
  end if;
  insert into public.profile_roles (profile_id, company_id, role)
  values (p_profile_id, v_link.company_id, 'coordinator')
  on conflict (profile_id, role) do nothing;
  insert into public.job_coordinators (job_id, profile_id, company_id)
  values (v_link.job_id, p_profile_id, v_link.company_id)
  on conflict do nothing;
  update public.portal_links set last_used_at = now() where id = v_link.id;
  return v_link.job_id;
end;
$$;
revoke all on function public.portal_admit(uuid, uuid) from public, anon, authenticated;
grant execute on function public.portal_admit(uuid, uuid) to service_role;

-- The coordinator signs the active agreement for their job.
create or replace function public.sign_agreement(
  p_job_id      uuid,
  p_version_id  uuid,
  p_signer_name text,
  p_initials    jsonb,
  p_ip          inet default null,
  p_user_agent  text default null
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_job       public.jobs%rowtype;
  v_version   public.agreement_versions%rowtype;
  v_email     text;
  v_missing   text;
  v_signature uuid;
begin
  if not private.is_job_coordinator(p_job_id) then
    raise exception 'only this job''s coordinator can sign its agreement';
  end if;
  select * into v_job from public.jobs where id = p_job_id;
  if v_job.status in ('released', 'cancelled') then
    raise exception 'this date is no longer held; contact the office';
  end if;

  select * into v_version from public.agreement_versions
  where id = p_version_id and company_id = v_job.company_id and status = 'active';
  if not found then
    raise exception 'this agreement version is not the current one; reload the page';
  end if;
  if exists (select 1 from public.agreement_signatures where job_id = p_job_id and version_id = p_version_id) then
    raise exception 'this agreement is already signed for this job';
  end if;

  if length(btrim(coalesce(p_signer_name, ''))) not between 2 and 200 then
    raise exception 'type your full name to sign';
  end if;
  if jsonb_typeof(coalesce(p_initials, '{}'::jsonb)) <> 'object' then
    raise exception 'initials must be an object';
  end if;
  select s ->> 'title' into v_missing
  from jsonb_array_elements(v_version.sections) s
  where coalesce((s ->> 'initial')::boolean, false)
    and length(btrim(coalesce(p_initials ->> (s ->> 'key'), ''))) not between 1 and 5
  limit 1;
  if v_missing is not null then
    raise exception 'initial the section "%" to sign', v_missing;
  end if;

  select email into v_email from public.profiles where id = auth.uid();

  insert into public.agreement_signatures
    (company_id, job_id, version_id, signer_profile_id, signer_name, signer_email, initials, ip_address, user_agent)
  values
    (v_job.company_id, p_job_id, p_version_id, auth.uid(), btrim(p_signer_name), v_email,
     coalesce(p_initials, '{}'::jsonb), p_ip, left(p_user_agent, 500))
  returning id into v_signature;

  -- Signing confirms the hold.
  update public.date_holds set status = 'confirmed', confirmed_at = now()
  where job_id = p_job_id and status = 'held';
  update public.season_offers o set stage = 'confirmed', responded_at = coalesce(o.responded_at, now())
  where o.id in (select h.offer_id from public.date_holds h where h.job_id = p_job_id and h.offer_id is not null)
    and o.stage <> 'confirmed';
  if v_job.status = 'held' then
    update public.jobs set status = 'planning' where id = p_job_id;
  end if;

  insert into public.touchpoints (company_id, org_id, job_id, channel, direction, summary, actor_id, actor_kind, source_ref)
  values (v_job.company_id, v_job.org_id, p_job_id, 'portal', 'in',
          format('Signed the photo day agreement (version %s)', v_version.version),
          auth.uid(), 'contact', jsonb_build_object('signature_id', v_signature));

  return v_signature;
end;
$$;
revoke all on function public.sign_agreement(uuid, uuid, text, jsonb, inet, text) from public, anon;
grant execute on function public.sign_agreement(uuid, uuid, text, jsonb, inet, text) to authenticated, service_role;

-- Signed PDFs live in a private bucket. Only the server reads or writes it;
-- people download through a short signed URL after an RLS check.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('agreements', 'agreements', false, 5242880, array['application/pdf'])
    on conflict (id) do nothing;
  end if;
end;
$$;
