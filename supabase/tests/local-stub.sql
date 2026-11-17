-- Minimal stand-ins for the parts of Supabase the migrations use, so the
-- migrations and permission tests can run on a plain local Postgres
-- (scripts/test-db.sh). Never applied to the hosted project.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant anon, authenticated, service_role to current_user;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema vault;
create table vault.secrets (id uuid primary key default gen_random_uuid(), name text, secret text);
create function vault.create_secret(p_secret text, p_name text) returns uuid language sql as $$
  insert into vault.secrets (secret, name) values (p_secret, p_name) returning id
$$;
create function vault.update_secret(p_id uuid, p_secret text) returns void language sql as $$
  update vault.secrets set secret = p_secret where id = p_id
$$;
create view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
