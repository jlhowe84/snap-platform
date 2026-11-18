-- =============================================================================
-- Permission tests: every table from every role (spec: tests that must pass
-- before any phase exits). Runs in one transaction and rolls back, so it can
-- run against any database that has the migrations, including the hosted one.
--   Local:   scripts/test-db.sh
--   Hosted:  run this file in the Supabase SQL editor (it leaves no trace).
-- Output: one NOTICE per passing check; the first failure raises and stops.
-- =============================================================================
begin;

create schema t;
grant usage on schema t to authenticated, anon;

-- Who is acting. Fixture ids are fixed so failures are easy to read.
create table t.who (name text primary key, id uuid);
grant select on t.who to authenticated, anon;

create function t.login(p_name text) returns void language plpgsql as $$
declare v uuid;
begin
  reset role;
  if p_name = 'anon' then
    perform set_config('request.jwt.claim.sub', '', true);
    set local role anon;
    return;
  end if;
  select id into v from t.who where name = p_name;
  if v is null then raise exception 'no fixture user %', p_name; end if;
  perform set_config('request.jwt.claim.sub', v::text, true);
  set local role authenticated;
end $$;

create function t.ok(p_label text) returns void language plpgsql as $$
begin raise notice 'ok   %', p_label; end $$;

create function t.count_is(p_sql text, p_expected bigint, p_label text) returns void language plpgsql as $$
declare n bigint;
begin
  execute p_sql into n;
  if n is distinct from p_expected then
    raise exception 'FAIL %: expected %, got %', p_label, p_expected, n;
  end if;
  perform t.ok(p_label);
end $$;

create function t.fails(p_sql text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    perform t.ok(p_label || ' (refused: ' || left(sqlerrm, 60) || ')');
    return;
  end;
  raise exception 'FAIL %: statement was allowed', p_label;
end $$;

create function t.works(p_sql text, p_label text) returns void language plpgsql as $$
begin
  execute p_sql;
  perform t.ok(p_label);
end $$;

grant execute on all functions in schema t to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Fixtures (as the migration owner, RLS bypassed)
-- ---------------------------------------------------------------------------
insert into public.companies (id, slug, name) values
  ('a0000000-0000-0000-0000-00000000000a', 'test-a', 'Test Company A'),
  ('b0000000-0000-0000-0000-00000000000b', 'test-b', 'Test Company B');
select private.seed_company_defaults('a0000000-0000-0000-0000-00000000000a');
select private.seed_company_defaults('b0000000-0000-0000-0000-00000000000b');

insert into t.who values
  ('owner',    '10000000-0000-0000-0000-000000000001'),
  ('admin',    '10000000-0000-0000-0000-000000000002'),
  ('office',   '10000000-0000-0000-0000-000000000003'),
  ('support',  '10000000-0000-0000-0000-000000000004'),
  ('crew',     '10000000-0000-0000-0000-000000000005'),
  ('coord',    '10000000-0000-0000-0000-000000000006'),
  ('outsider', '10000000-0000-0000-0000-000000000007'),
  ('owner_b',  '10000000-0000-0000-0000-000000000008');

-- Invites first, so the sign-up trigger assigns company and roles.
insert into public.staff_invites (company_id, email, roles) values
  ('a0000000-0000-0000-0000-00000000000a', 'owner@test.invalid',   '{owner}'),
  ('a0000000-0000-0000-0000-00000000000a', 'admin@test.invalid',   '{admin}'),
  ('a0000000-0000-0000-0000-00000000000a', 'office@test.invalid',  '{office}'),
  ('a0000000-0000-0000-0000-00000000000a', 'support@test.invalid', '{support}'),
  ('a0000000-0000-0000-0000-00000000000a', 'crew@test.invalid',    '{crew}'),
  ('a0000000-0000-0000-0000-00000000000a', 'coord@test.invalid',   '{coordinator}'),
  ('b0000000-0000-0000-0000-00000000000b', 'ownerb@test.invalid',  '{owner}');

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'owner@test.invalid'),
  ('10000000-0000-0000-0000-000000000002', 'admin@test.invalid'),
  ('10000000-0000-0000-0000-000000000003', 'office@test.invalid'),
  ('10000000-0000-0000-0000-000000000004', 'support@test.invalid'),
  ('10000000-0000-0000-0000-000000000005', 'crew@test.invalid'),
  ('10000000-0000-0000-0000-000000000006', 'coord@test.invalid'),
  ('10000000-0000-0000-0000-000000000007', 'outsider@test.invalid'),
  ('10000000-0000-0000-0000-000000000008', 'ownerb@test.invalid');

insert into public.organizations (id, company_id, name) values
  ('20000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'League A1'),
  ('20000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'League B1');
insert into public.contacts (id, company_id, full_name, email) values
  ('30000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'Contact A1', 'c@test.invalid');
insert into public.organization_contacts (company_id, org_id, contact_id) values
  ('a0000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1');
insert into public.organization_terms (org_id, company_id, delivery_method) values
  ('20000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'mailer');
insert into public.league_notes (company_id, org_id, body) values
  ('a0000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 'A lesson');
insert into public.jobs (id, company_id, org_id, name) values
  ('40000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 'Job A1'),
  ('40000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 'Job A2'),
  ('40000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000b1', 'Job B1');
insert into public.photo_days (company_id, job_id, date) values
  ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', '2027-04-17'),
  ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a2', '2027-04-24'),
  ('b0000000-0000-0000-0000-00000000000b', '40000000-0000-0000-0000-0000000000b1', '2027-04-24');
insert into public.job_links (job_id, company_id, captura_gallery_id) values
  ('40000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 123);
insert into public.job_contacts (job_id, contact_id, company_id) values
  ('40000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a');
insert into public.job_coordinators (job_id, profile_id, company_id) values
  ('40000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-00000000000a');
insert into public.crew_members (company_id, profile_id, full_name, positions, level) values
  ('a0000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000005', 'Crew A', '{photographer}', 2),
  ('a0000000-0000-0000-0000-00000000000a', null, 'Crew A two', '{poser}', 3);
insert into public.playbooks (id, company_id, key, name, kind) values
  ('50000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'planning_test', 'Planning', 'planning');
insert into public.playbook_steps (company_id, playbook_id, position, name) values
  ('a0000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000a1', 1, 'Send planning form');
insert into public.tasks (company_id, job_id, title) values
  ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 'Task A1');

-- Wave A: booking and planning
insert into public.season_offers (company_id, org_id, season, stage, tier) values
  ('a0000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 'Spring 2027', 'offered', 'top'),
  ('b0000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000b1', 'Spring 2027', 'offered', 'other');
insert into public.date_holds (company_id, job_id, photo_day_id, expires_on)
  select company_id, job_id, id, date '2027-01-01' from public.photo_days where job_id = '40000000-0000-0000-0000-0000000000a1';
insert into public.leads (company_id, org_name) values ('a0000000-0000-0000-0000-00000000000a', 'Lead A');
insert into public.touchpoints (company_id, org_id, channel, direction, summary) values
  ('a0000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 'call', 'out', 'Offered spring');
insert into public.agreement_versions (id, company_id, version, title, status) values
  ('60000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 1, 'Agreement v1', 'active'),
  ('60000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-00000000000a', 2, 'Agreement v2', 'draft'),
  ('60000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 1, 'Agreement B', 'active');
insert into public.agreement_signatures (id, company_id, job_id, version_id, signer_name, signer_email) values
  ('61000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000000a1', 'Contact A1', 'c@test.invalid');
insert into public.planning_forms (job_id, company_id, sent_at) values
  ('40000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', now()),
  ('40000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-00000000000a', now());
insert into public.teams (id, company_id, job_id, name, source) values
  ('70000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 'Tigers', 'roster'),
  ('70000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 'Lions', 'roster'),
  ('70000000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a2', 'Hawks', 'roster');
insert into public.roster_files (company_id, job_id, storage_path, file_name, mime_type, size_bytes, source) values
  ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 'a/a1/roster.csv', 'roster.csv', 'text/csv', 1200, 'email');
insert into public.roster_versions (company_id, job_id, version, status) values
  ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 1, 'needs_answers');
insert into public.schedules (id, company_id, job_id, photo_day_id)
  select case when job_id = '40000000-0000-0000-0000-0000000000a1' then '80000000-0000-0000-0000-0000000000a1'::uuid
              else '80000000-0000-0000-0000-0000000000a2'::uuid end,
         company_id, job_id, id
  from public.photo_days where company_id = 'a0000000-0000-0000-0000-00000000000a';
insert into public.schedule_slots (company_id, job_id, schedule_id, station, starts_at, minutes, team_id) values
  ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', '80000000-0000-0000-0000-0000000000a1', 1, '09:00', 15, '70000000-0000-0000-0000-0000000000a1');
insert into public.portal_links (company_id, job_id, token_hash, expires_at) values
  ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 'hash-a1', now() + interval '60 days');
insert into public.job_messages (company_id, job_id, author_kind, body, internal) values
  ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 'staff', 'Welcome', false),
  ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 'staff', 'Office only', true);

-- ---------------------------------------------------------------------------
-- Sign-up and invites
-- ---------------------------------------------------------------------------
select t.count_is($$select count(*) from public.profile_roles where company_id = 'a0000000-0000-0000-0000-00000000000a'$$, 6, 'invites assign one role each in company A');
select t.count_is($$select count(*) from public.profiles where id = '10000000-0000-0000-0000-000000000007' and company_id is null$$, 1, 'a sign-in with no invite gets no company');
select t.count_is($$select count(*) from public.profile_roles where profile_id = '10000000-0000-0000-0000-000000000007'$$, 0, 'and no roles');

-- ---------------------------------------------------------------------------
-- Reads, table by table, role by role
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  -- table, expected rows for: owner admin office support crew coord outsider owner_b
  cases text[][] := array[
    array['organizations',         '1','1','1','1','0','0','0','1'],
    array['contacts',              '1','1','1','1','0','0','0','0'],
    array['organization_contacts', '1','1','1','1','0','0','0','0'],
    array['organization_terms',    '1','1','1','1','0','0','0','0'],
    array['league_notes',          '1','1','1','1','0','0','0','0'],
    array['jobs',                  '2','2','2','2','0','1','0','1'],
    array['photo_days',            '2','2','2','2','0','1','0','1'],
    array['job_links',             '1','1','1','1','0','1','0','0'],
    array['job_contacts',          '1','1','1','1','0','1','0','0'],
    array['job_coordinators',      '1','1','1','1','0','1','0','0'],
    array['crew_members',          '2','2','2','2','1','0','0','0'],
    array['playbooks',             '1','1','1','1','0','0','0','0'],
    array['playbook_steps',        '1','1','1','1','0','0','0','0'],
    array['tasks',                 '1','1','1','1','0','0','0','0'],
    array['settings',              '9','9','9','9','0','0','0','9'],
    array['action_types',          '19','19','19','19','0','0','0','19'],
    array['integration_status',    '9','9','9','9','0','0','0','9'],
    array['agent_runs',            '0','0','0','0','0','0','0','0'],
    array['companies',             '1','1','1','1','1','1','0','1'],
    array['staff_invites',         '6','6','0','0','0','0','0','1'],
    array['season_offers',         '1','1','1','1','0','0','0','1'],
    array['date_holds',            '1','1','1','1','0','1','0','0'],
    array['leads',                 '1','1','1','1','0','0','0','0'],
    array['touchpoints',           '1','1','1','1','0','0','0','0'],
    array['agreement_versions',    '2','2','2','2','0','1','0','1'],
    array['agreement_signatures',  '1','1','1','1','0','1','0','0'],
    array['planning_forms',        '2','2','2','2','0','1','0','0'],
    array['teams',                 '3','3','3','3','0','2','0','0'],
    array['roster_files',          '1','1','1','1','0','1','0','0'],
    array['roster_versions',       '1','1','1','1','0','1','0','0'],
    array['schedules',             '2','2','2','2','0','1','0','0'],
    array['schedule_slots',        '1','1','1','1','0','1','0','0'],
    array['portal_links',          '1','1','1','0','0','0','0','0'],
    array['job_messages',          '2','2','2','2','0','1','0','0'],
    array['agent_events',          '2','2','2','2','0','0','0','0'],
    array['date_capacity',         '2','2','2','2','0','1','0','1'],
    array['photo_day_readiness',   '2','2','2','2','0','1','0','1']
  ];
  who text[] := array['owner','admin','office','support','crew','coord','outsider','owner_b'];
  i int; k int;
begin
  for i in 1 .. array_length(cases, 1) loop
    for k in 1 .. 8 loop
      perform t.login(who[k]);
      perform t.count_is(format('select count(*) from public.%I', cases[i][1]),
                         cases[i][k + 1]::bigint, format('%s sees %s rows of %s', who[k], cases[i][k + 1], cases[i][1]));
    end loop;
  end loop;
  reset role;
end $$;

-- Nobody outside the server can empty a table (TRUNCATE skips RLS).
reset role;
select t.count_is($$select count(*) from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated')
    and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')$$, 0, 'no TRUNCATE, TRIGGER or REFERENCES for app roles');
select t.count_is($$select count(*) from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon'$$, 0, 'anon holds no table privileges');

-- Anonymous visitors reach nothing.
select t.login('anon');
select t.fails($$select count(*) from public.organizations$$, 'anon cannot read organizations');
select t.fails($$select count(*) from public.jobs$$, 'anon cannot read jobs');
select t.fails($$select count(*) from public.contacts$$, 'anon cannot read contacts');
select t.fails($$select count(*) from public.profiles$$, 'anon cannot read profiles');

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------
select t.login('office');
select t.works($$insert into public.organizations (company_id, name) values ('a0000000-0000-0000-0000-00000000000a', 'New league')$$, 'office adds a league');
select t.fails($$insert into public.organizations (company_id, name) values ('b0000000-0000-0000-0000-00000000000b', 'Sneaky')$$, 'office cannot add a league to another company');
select t.count_is($$with d as (delete from public.organizations where name = 'New league' returning 1) select count(*) from d$$, 0, 'office cannot delete a league');
select t.count_is($$with u as (update public.settings set value = '5' where key = 'capacity.stations_per_date' returning 1) select count(*) from u$$, 0, 'office cannot change settings');
select t.fails($$insert into public.staff_invites (company_id, email, roles) values ('a0000000-0000-0000-0000-00000000000a', 'x@test.invalid', '{office}')$$, 'office cannot invite');
select t.count_is($$with u as (update public.action_types set autonomy_level = 3 where key = 'messages.send' returning 1) select count(*) from u$$, 0, 'office cannot change autonomy');

select t.login('support');
select t.fails($$insert into public.organizations (company_id, name) values ('a0000000-0000-0000-0000-00000000000a', 'Support league')$$, 'support cannot add a league');
select t.count_is($$with u as (update public.jobs set name = 'x' returning 1) select count(*) from u$$, 0, 'support cannot edit jobs');
select t.works($$update public.tasks set status = 'done' where title = 'Task A1'$$, 'support can work a task');

select t.login('crew');
select t.fails($$insert into public.jobs (company_id, name) values ('a0000000-0000-0000-0000-00000000000a', 'Crew job')$$, 'crew cannot add jobs');
select t.count_is($$with u as (update public.crew_members set level = 1 returning 1) select count(*) from u$$, 0, 'crew cannot change their own level');

select t.login('coord');
select t.count_is($$with u as (update public.jobs set name = 'Renamed' returning 1) select count(*) from u$$, 0, 'coordinator cannot edit the job (Wave A opens roster, schedule, teams, logo)');
select t.fails($$insert into public.job_coordinators (job_id, profile_id, company_id) values ('40000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-00000000000a')$$, 'coordinator cannot link themselves to another job');

select t.login('admin');
select t.works($$update public.settings set value = '10' where key = 'capacity.stations_per_date'$$, 'admin changes a setting');
select t.fails($$insert into public.profile_roles (profile_id, company_id, role) values ('10000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', 'owner')$$, 'admin cannot grant owner');
select t.fails($$insert into public.staff_invites (company_id, email, roles) values ('a0000000-0000-0000-0000-00000000000a', 'y@test.invalid', '{admin}')$$, 'admin cannot invite an admin');
select t.works($$insert into public.profile_roles (profile_id, company_id, role) values ('10000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', 'support')$$, 'admin grants support');
select t.count_is($$with u as (update public.action_types set autonomy_level = 2 where key = 'messages.send' returning 1) select count(*) from u$$, 0, 'admin cannot change autonomy');

select t.login('owner');
select t.works($$insert into public.profile_roles (profile_id, company_id, role) values ('10000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'office')$$, 'owner grants a role');
select t.works($$update public.action_types set autonomy_level = 2 where key = 'messages.send'$$, 'owner changes autonomy');
select t.fails($$update public.profiles set company_id = 'b0000000-0000-0000-0000-00000000000b' where id = '10000000-0000-0000-0000-000000000001'$$, 'nobody moves themselves to another company');
select t.fails($$insert into public.activity_log (company_id, actor_kind, action, table_name) values ('a0000000-0000-0000-0000-00000000000a', 'person', 'x', 'x')$$, 'the activity log cannot be written directly');
select t.fails($$update public.activity_log set action = 'x'$$, 'the activity log cannot be edited');

-- ---------------------------------------------------------------------------
-- Wave A writes: booking
-- ---------------------------------------------------------------------------
select t.login('support');
select t.works($$insert into public.leads (company_id, org_name, source) values ('a0000000-0000-0000-0000-00000000000a', 'Phone lead', 'phone')$$, 'support logs a new inquiry');
select t.works($$insert into public.touchpoints (company_id, channel, direction, summary) values ('a0000000-0000-0000-0000-00000000000a', 'call', 'in', 'Asked about spring')$$, 'support logs a call');
select t.fails($$insert into public.season_offers (company_id, org_id, season) values ('a0000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 'Fall 2027')$$, 'support cannot make a season offer');
select t.fails($$insert into public.portal_links (company_id, job_id, token_hash, expires_at) values ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 'x', now())$$, 'support cannot mint a portal link');

select t.login('crew');
select t.fails($$insert into public.leads (company_id, org_name) values ('a0000000-0000-0000-0000-00000000000a', 'Crew lead')$$, 'crew cannot log a lead');

select t.login('office');
select t.works($$insert into public.season_offers (company_id, org_id, season) values ('a0000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 'Fall 2027')$$, 'office makes a season offer');
select t.fails($$insert into public.season_offers (company_id, org_id, season) values ('a0000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 'Autumn 2027')$$, 'a season must read like Spring 2027');
select t.fails($$insert into public.touchpoints (company_id, channel, direction, summary, actor_kind) values ('a0000000-0000-0000-0000-00000000000a', 'note', 'internal', 'x', 'agent')$$, 'people cannot log a touchpoint as the agent');
select t.count_is($$with u as (update public.agreement_versions set title = 'Edited' returning 1) select count(*) from u$$, 0, 'office cannot edit the agreement');
select t.count_is($$select stations_used from public.date_capacity where date = '2027-04-17'$$, 2, 'capacity counts the stations booked on a date');
select t.works($$update public.jobs set status = 'released' where id = '40000000-0000-0000-0000-0000000000a2'$$, 'office releases a lapsed hold');
select t.count_is($$select count(*) from public.date_capacity where date = '2027-04-24'$$, 0, 'a released date frees its stations');

select t.login('admin');
select t.works($$update public.agreement_versions set title = 'Agreement v2 (draft)' where version = 2$$, 'admin edits a draft agreement');
select t.fails($$update public.agreement_versions set title = 'Rewrite' where version = 1$$, 'a signed agreement version cannot change');
select t.fails($$delete from public.agreement_versions where version = 1$$, 'a signed agreement version cannot be deleted');

select t.login('owner');
select t.fails($$insert into public.agreement_signatures (company_id, job_id, version_id, signer_name, signer_email) values ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a2', '60000000-0000-0000-0000-0000000000a1', 'Fake', 'f@test.invalid')$$, 'nobody signs through the API, not even the owner');

reset role;
select t.works($$update public.agreement_signatures set pdf_path = 'a/a1/agreement.pdf' where id = '61000000-0000-0000-0000-0000000000a1'$$, 'the server files the signed PDF');
select t.fails($$update public.agreement_signatures set signer_name = 'Someone else' where id = '61000000-0000-0000-0000-0000000000a1'$$, 'a signature cannot be changed');
select t.fails($$delete from public.agreement_signatures where id = '61000000-0000-0000-0000-0000000000a1'$$, 'a signature cannot be removed');

-- ---------------------------------------------------------------------------
-- Wave A writes: the coordinator portal surface
-- ---------------------------------------------------------------------------
select t.login('coord');
select t.count_is($$with u as (update public.planning_forms set answers = '{"picture_day_contact": "Pat"}', submitted_at = now(), submitted_by = auth.uid() where job_id = '40000000-0000-0000-0000-0000000000a1' returning 1) select count(*) from u$$, 1, 'coordinator submits the planning form');
select t.count_is($$with u as (update public.planning_forms set answers = '{}' where job_id = '40000000-0000-0000-0000-0000000000a2' returning 1) select count(*) from u$$, 0, 'coordinator cannot touch another job''s form');
select t.fails($$update public.planning_forms set sent_at = null where job_id = '40000000-0000-0000-0000-0000000000a1'$$, 'coordinator cannot change when the form was sent');
select t.works($$insert into public.roster_files (company_id, job_id, storage_path, file_name, mime_type, size_bytes, uploaded_by) values ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 'a/a1/r2.xlsx', 'r2.xlsx', 'application/vnd.ms-excel', 5000, auth.uid())$$, 'coordinator uploads a roster');
select t.fails($$insert into public.roster_files (company_id, job_id, storage_path, file_name, mime_type, size_bytes, uploaded_by) values ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a2', 'a/a2/r.csv', 'r.csv', 'text/csv', 10, auth.uid())$$, 'coordinator cannot upload to another job');
select t.fails($$insert into public.roster_files (company_id, job_id, storage_path, file_name, mime_type, size_bytes, uploaded_by) values ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 'a/a1/r3.csv', 'r3.csv', 'text/csv', 10, '10000000-0000-0000-0000-000000000003')$$, 'coordinator cannot upload as someone else');
select t.fails($$insert into public.roster_files (company_id, job_id, storage_path, file_name, mime_type, size_bytes, uploaded_by) values ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 'a/a1/big.pdf', 'big.pdf', 'application/pdf', 30000000, auth.uid())$$, 'a roster file over 25 MB is refused');
select t.works($$insert into public.teams (id, company_id, job_id, name, source) values ('70000000-0000-0000-0000-0000000000a4', 'a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 'Bears', 'coordinator')$$, 'coordinator adds a team');
select t.fails($$insert into public.teams (company_id, job_id, name, source) values ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 'Wolves', 'office')$$, 'coordinator cannot add a team as the office');
select t.fails($$update public.teams set tc_number = '12' where id = '70000000-0000-0000-0000-0000000000a1'$$, 'coordinator cannot set team card numbers');
select t.works($$update public.teams set coach_name = 'Coach Lee' where id = '70000000-0000-0000-0000-0000000000a1'$$, 'coordinator fills in a coach');
select t.count_is($$with d as (delete from public.teams where id = '70000000-0000-0000-0000-0000000000a2' returning 1) select count(*) from d$$, 0, 'coordinator cannot delete a team from the roster');
select t.works($$insert into public.schedule_slots (company_id, job_id, schedule_id, station, starts_at, minutes, team_id) values ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', '80000000-0000-0000-0000-0000000000a1', 1, '09:00', 15, '70000000-0000-0000-0000-0000000000a2')$$, 'coordinator places a team');
select t.fails($$insert into public.schedule_slots (company_id, job_id, schedule_id, station, starts_at, minutes, team_id) values ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', '80000000-0000-0000-0000-0000000000a1', 2, '10:00', 15, '70000000-0000-0000-0000-0000000000a3')$$, 'a slot cannot use another job''s team');
select t.fails($$insert into public.schedule_slots (company_id, job_id, schedule_id, station, starts_at, minutes, team_id) values ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a2', '80000000-0000-0000-0000-0000000000a2', 1, '10:00', 15, '70000000-0000-0000-0000-0000000000a3')$$, 'coordinator cannot schedule another job');
select t.count_is($$select count(*) from public.schedule_problems('80000000-0000-0000-0000-0000000000a1')$$, 2, 'the scheduler names an overlap and a team with no slot');
select t.fails($$select public.submit_schedule('80000000-0000-0000-0000-0000000000a1')$$, 'an incomplete schedule cannot be submitted');
select t.fails($$update public.schedules set status = 'submitted' where id = '80000000-0000-0000-0000-0000000000a1'$$, 'coordinator cannot mark a schedule submitted directly');
select t.fails($$update public.schedules set stations = 6 where id = '80000000-0000-0000-0000-0000000000a1'$$, 'coordinator cannot add stations');
select t.works($$update public.schedule_slots set station = 2 where team_id = '70000000-0000-0000-0000-0000000000a2'$$, 'coordinator moves a team to station 2');
select t.works($$insert into public.schedule_slots (company_id, job_id, schedule_id, station, starts_at, minutes, team_id) values ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', '80000000-0000-0000-0000-0000000000a1', 1, '09:15', 15, '70000000-0000-0000-0000-0000000000a4')$$, 'coordinator places the last team');
select t.count_is($$select count(*) from public.schedule_problems('80000000-0000-0000-0000-0000000000a1')$$, 0, 'the schedule is complete');
select t.works($$select public.submit_schedule('80000000-0000-0000-0000-0000000000a1')$$, 'coordinator submits a complete schedule');
select t.fails($$insert into public.job_messages (company_id, job_id, author_id, author_kind, body, internal) values ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', auth.uid(), 'coordinator', 'psst', true)$$, 'coordinator cannot post an internal note');
select t.fails($$insert into public.job_messages (company_id, job_id, author_id, author_kind, body) values ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', auth.uid(), 'staff', 'I am staff')$$, 'coordinator cannot post as staff');
select t.works($$insert into public.job_messages (company_id, job_id, author_id, author_kind, body) values ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', auth.uid(), 'coordinator', 'Roster attached')$$, 'coordinator posts a message');
select t.count_is($$select count(*) from public.photo_day_readiness where agreement_signed and planning_form = 'submitted' and roster = 'received' and schedule = 'submitted' and captura_gallery$$, 1, 'readiness shows what the coordinator finished');
select t.fails($$insert into public.date_holds (company_id, job_id, photo_day_id, expires_on) select company_id, job_id, id, current_date from public.photo_days$$, 'coordinator cannot place a hold');

select t.login('office');
select t.count_is($$select count(*) from public.agent_events where kind in ('planning_form.submitted', 'roster.uploaded', 'schedule.submitted', 'portal.message')$$, 5, 'portal actions wake the agent');
select t.fails($$insert into public.agent_events (company_id, kind) values ('a0000000-0000-0000-0000-00000000000a', 'test.event')$$, 'people cannot write agent events');
select t.works($$update public.schedules set stations = 3 where id = '80000000-0000-0000-0000-0000000000a2'$$, 'office changes stations');
select t.login('owner');   -- the never-list checks below run as the owner

-- ---------------------------------------------------------------------------
-- The never list (enforced in the database, whoever asks)
-- ---------------------------------------------------------------------------
select t.fails($$update public.action_types set kind = 'propose' where key = 'money.refund'$$, 'a never action cannot be moved off the list');
select t.fails($$update public.action_types set autonomy_level = 3 where key = 'money.discount'$$, 'a never action cannot earn autonomy');
select t.fails($$delete from public.action_types where key = 'job.cancel'$$, 'a never action cannot be deleted');
select t.fails($$insert into public.agent_actions (company_id, action_type_key, actor_kind, actor_id, status) values ('a0000000-0000-0000-0000-00000000000a', 'money.refund', 'person', '10000000-0000-0000-0000-000000000001', 'proposed')$$, 'a refund cannot even be proposed');
select t.fails($$insert into public.agent_actions (company_id, action_type_key, actor_kind, actor_id, status) values ('a0000000-0000-0000-0000-00000000000a', 'photo_day.postpone', 'person', '10000000-0000-0000-0000-000000000001', 'executed')$$, 'a postponement cannot be executed through the queue');
select t.works($$insert into public.agent_actions (company_id, action_type_key, actor_kind, actor_id, status) values ('a0000000-0000-0000-0000-00000000000a', 'money.refund', 'person', '10000000-0000-0000-0000-000000000001', 'flagged')$$, 'a refund can be flagged for a person');
select t.fails($$insert into public.agent_actions (company_id, action_type_key, actor_kind, actor_id, status) values ('a0000000-0000-0000-0000-00000000000a', 'messages.send', 'agent', null, 'sent')$$, 'people cannot record actions as the agent');

reset role;
-- The pause switch stops an agent send (service role path).
insert into public.agent_pauses (company_id, reason) values ('a0000000-0000-0000-0000-00000000000a', 'test');
select t.fails($$insert into public.agent_actions (company_id, action_type_key, actor_kind, status) values ('a0000000-0000-0000-0000-00000000000a', 'messages.send', 'agent', 'sent')$$, 'a paused agent cannot send');
update public.agent_pauses set lifted_at = now() where company_id = 'a0000000-0000-0000-0000-00000000000a';
select t.works($$insert into public.agent_actions (company_id, action_type_key, actor_kind, status) values ('a0000000-0000-0000-0000-00000000000a', 'messages.send', 'agent', 'sent')$$, 'after the pause lifts the agent can send (test mode still rewrites the address)');

-- ---------------------------------------------------------------------------
-- Secrets and server-only functions
-- ---------------------------------------------------------------------------
select private.set_integration_secret('a0000000-0000-0000-0000-00000000000a', 'captura', '{"k":"v"}');
select t.count_is($$select count(*) from (select public.integration_secret('a0000000-0000-0000-0000-00000000000a', 'captura')) x$$, 1, 'the server reads a secret');
select t.login('owner');
select t.fails($$select public.integration_secret('a0000000-0000-0000-0000-00000000000a', 'captura')$$, 'even the owner cannot read a secret through the API');
select t.fails($$select private.import_notion('a0000000-0000-0000-0000-00000000000a')$$, 'the import cannot be run through the API');
select t.fails($$select * from private.notion_staging$$, 'the import staging table is not reachable');

-- Activity log captured the writes above.
select t.login('office');
select t.count_is($$select count(*) from public.activity_log where table_name = 'organizations' and action = 'insert' and actor_kind = 'person' and row_id is not null and company_id = 'a0000000-0000-0000-0000-00000000000a' and changes ->> 'name' = 'New league'$$, 1, 'the league office added is in the activity log');
select t.login('crew');
select t.count_is($$select count(*) from public.activity_log$$, 0, 'crew cannot read the activity log');

reset role;
do $$ begin raise notice 'ALL PERMISSION TESTS PASSED'; end $$;
rollback;
