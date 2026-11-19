-- =============================================================================
-- A contact's email field can hold more than one address ("a@x.org; b@y.org"),
-- mostly from the Notion import. A portal link signs its contact in with the
-- first address in the field. The staff check looks at every address in the
-- field, so a field that names a staff address anywhere never opens a session.
-- =============================================================================

-- Every address in an email field, lower case, in the order written.
create or replace function private.email_addresses(p_field text)
returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(a order by n), '{}'::text[])
  from (
    select lower(trim(both '<>' from part)) as a, n
    from regexp_split_to_table(coalesce(p_field, ''), '[;,[:space:]]+') with ordinality as t(part, n)
  ) s
  where a like '%_@_%';
$$;

create or replace function private.first_email(p_field text)
returns text
language sql immutable set search_path = '' as $$
  select (private.email_addresses(p_field))[1];
$$;

revoke all on function private.email_addresses(text), private.first_email(text) from public, anon, authenticated;

create or replace function public.portal_link_lookup(p_token_hash text)
returns table (link_id uuid, job_id uuid, company_id uuid, email text, full_name text, profile_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_emails text[];
begin
  select private.email_addresses(c.email) into v_emails
  from public.portal_links l
  join public.contacts c on c.id = l.contact_id
  where l.token_hash = p_token_hash;

  if exists (
    select 1 from public.profiles p
    join public.profile_roles r on r.profile_id = p.id
    where lower(p.email) = any (coalesce(v_emails, '{}'::text[])) and r.role <> 'coordinator'
  ) then
    raise exception 'portal links cannot open a staff account' using errcode = 'P0001';
  end if;

  return query
  select l.id, l.job_id, l.company_id, private.first_email(c.email), c.full_name,
         (select p.id from public.profiles p where lower(p.email) = private.first_email(c.email) limit 1)
  from public.portal_links l
  join public.contacts c on c.id = l.contact_id
  where l.token_hash = p_token_hash
    and l.revoked_at is null
    and l.expires_at > now()
    and private.first_email(c.email) is not null;
end;
$$;
revoke all on function public.portal_link_lookup(text) from public, anon, authenticated;
grant execute on function public.portal_link_lookup(text) to service_role;

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

  select private.first_email(email) into v_email from public.contacts where id = v_link.contact_id;
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
