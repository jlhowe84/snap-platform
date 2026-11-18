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
update public.agreement_versions set sections =
  '[{"key": "fees", "title": "Fees", "body": "Fee terms", "initial": true},
    {"key": "weather", "title": "Weather", "body": "Weather terms", "initial": false}]'
  where id = '60000000-0000-0000-0000-0000000000a1';
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
  ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-0000000000a1/roster.csv', 'roster.csv', 'text/csv', 1200, 'email');
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
    array['clock_log',             '0','0','0','0','0','0','0','0'],
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
select t.works($$update public.agreement_signatures set pdf_path = 'a0000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-0000000000a1/agreement.pdf' where id = '61000000-0000-0000-0000-0000000000a1'$$, 'the server files the signed PDF');
select t.fails($$update public.agreement_signatures set signer_name = 'Someone else' where id = '61000000-0000-0000-0000-0000000000a1'$$, 'a signature cannot be changed');
select t.fails($$delete from public.agreement_signatures where id = '61000000-0000-0000-0000-0000000000a1'$$, 'a signature cannot be removed');

-- ---------------------------------------------------------------------------
-- Wave A writes: the coordinator portal surface
-- ---------------------------------------------------------------------------
select t.login('coord');
select t.count_is($$with u as (update public.planning_forms set answers = '{"picture_day_contact": "Pat"}', submitted_at = now(), submitted_by = auth.uid() where job_id = '40000000-0000-0000-0000-0000000000a1' returning 1) select count(*) from u$$, 1, 'coordinator submits the planning form');
select t.count_is($$with u as (update public.planning_forms set answers = '{}' where job_id = '40000000-0000-0000-0000-0000000000a2' returning 1) select count(*) from u$$, 0, 'coordinator cannot touch another job''s form');
select t.fails($$update public.planning_forms set sent_at = null where job_id = '40000000-0000-0000-0000-0000000000a1'$$, 'coordinator cannot change when the form was sent');
select t.works($$insert into public.roster_files (company_id, job_id, storage_path, file_name, mime_type, size_bytes, uploaded_by) values ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-0000000000a1/r2.xlsx', 'r2.xlsx', 'application/vnd.ms-excel', 5000, auth.uid())$$, 'coordinator uploads a roster');
select t.fails($$insert into public.roster_files (company_id, job_id, storage_path, file_name, mime_type, size_bytes, uploaded_by) values ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-0000000000a2/r.csv', 'r.csv', 'text/csv', 10, auth.uid())$$, 'coordinator cannot upload to another job');
select t.fails($$insert into public.roster_files (company_id, job_id, storage_path, file_name, mime_type, size_bytes, uploaded_by) values ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-0000000000a1/r3.csv', 'r3.csv', 'text/csv', 10, '10000000-0000-0000-0000-000000000003')$$, 'coordinator cannot upload as someone else');
select t.fails($$insert into public.roster_files (company_id, job_id, storage_path, file_name, mime_type, size_bytes, uploaded_by) values ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-0000000000a1/big.pdf', 'big.pdf', 'application/pdf', 30000000, auth.uid())$$, 'a roster file over 25 MB is refused');
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
-- ---------------------------------------------------------------------------
-- Wave A: portal links and signing
-- ---------------------------------------------------------------------------
reset role;
insert into public.contacts (id, company_id, full_name, email) values
  ('30000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-00000000000a', 'Coord Person', 'COORD@test.invalid'),
  ('30000000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-00000000000a', 'Office Person', 'office@test.invalid'),
  ('30000000-0000-0000-0000-0000000000a4', 'a0000000-0000-0000-0000-00000000000a', 'New Person', 'new@test.invalid');
insert into public.portal_links (company_id, job_id, contact_id, token_hash, expires_at, revoked_at) values
  ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a2', '30000000-0000-0000-0000-0000000000a2', 'hash-a2', now() + interval '30 days', null),
  ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a3', 'hash-staff', now() + interval '30 days', null),
  ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a4', 'hash-old', now() - interval '1 day', null),
  ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a4', 'hash-revoked', now() + interval '30 days', now());

select t.count_is($$select count(*) from public.portal_link_lookup('hash-a2') where profile_id = '10000000-0000-0000-0000-000000000006' and email = 'coord@test.invalid'$$, 1, 'the server finds a live link and its person');
select t.count_is($$select count(*) from public.portal_link_lookup('hash-old')$$, 0, 'an expired link finds nothing');
select t.count_is($$select count(*) from public.portal_link_lookup('hash-revoked')$$, 0, 'a revoked link finds nothing');
select t.count_is($$select count(*) from public.portal_link_lookup('no-such-hash')$$, 0, 'an unknown token finds nothing');
select t.fails($$select * from public.portal_link_lookup('hash-staff')$$, 'a portal link never opens a staff account');
select t.fails($$select public.portal_admit((select id from public.portal_links where token_hash = 'hash-a2'), '10000000-0000-0000-0000-000000000003')$$, 'a link cannot admit a different person');

select t.login('coord');
select t.fails($$select * from public.portal_link_lookup('hash-a2')$$, 'people cannot look up portal links');
select t.fails($$select public.portal_admit((select id from public.portal_links limit 1), auth.uid())$$, 'people cannot admit themselves');

reset role;
select t.works($$select public.portal_admit((select id from public.portal_links where token_hash = 'hash-a2'), '10000000-0000-0000-0000-000000000006')$$, 'the server admits the coordinator to the job on their link');
select t.count_is($$select count(*) from public.portal_links where token_hash = 'hash-a2' and last_used_at is not null$$, 1, 'the link records its use');

select t.login('coord');
select t.count_is($$select count(*) from public.jobs$$, 2, 'the coordinator now sees both of their jobs');
select t.fails($$select public.sign_agreement('40000000-0000-0000-0000-0000000000a2', '60000000-0000-0000-0000-0000000000a1', 'Coord Person', '{"fees": "CP"}')$$, 'a released date cannot be signed');

reset role;
update public.jobs set status = 'held' where id = '40000000-0000-0000-0000-0000000000a2';
insert into public.date_holds (company_id, job_id, photo_day_id, offer_id, expires_on)
  select pd.company_id, pd.job_id, pd.id, o.id, current_date + 14
  from public.photo_days pd, public.season_offers o
  where pd.job_id = '40000000-0000-0000-0000-0000000000a2' and o.company_id = 'a0000000-0000-0000-0000-00000000000a' and o.season = 'Spring 2027';

select t.login('office');
select t.fails($$select public.sign_agreement('40000000-0000-0000-0000-0000000000a2', '60000000-0000-0000-0000-0000000000a1', 'Office Person', '{"fees": "OP"}')$$, 'the office cannot sign for a league');

select t.login('coord');
select t.fails($$select public.sign_agreement('40000000-0000-0000-0000-0000000000a2', '60000000-0000-0000-0000-0000000000a2', 'Coord Person', '{"fees": "CP"}')$$, 'a draft agreement cannot be signed');
select t.fails($$select public.sign_agreement('40000000-0000-0000-0000-0000000000a2', '60000000-0000-0000-0000-0000000000a1', 'Coord Person', '{}')$$, 'every section that needs initials must be initialled');
select t.fails($$select public.sign_agreement('40000000-0000-0000-0000-0000000000a2', '60000000-0000-0000-0000-0000000000a1', ' ', '{"fees": "CP"}')$$, 'a signature needs a typed name');
select t.fails($$select public.sign_agreement('40000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000000a1', 'Coord Person', '{"fees": "CP"}')$$, 'the same agreement cannot be signed twice for a job');
select t.works($$select public.sign_agreement('40000000-0000-0000-0000-0000000000a2', '60000000-0000-0000-0000-0000000000a1', 'Coord Person', '{"fees": "CP"}', '203.0.113.9', 'test agent')$$, 'the coordinator signs');
select t.count_is($$select count(*) from public.agreement_signatures where job_id = '40000000-0000-0000-0000-0000000000a2' and signer_email = 'coord@test.invalid' and initials ->> 'fees' = 'CP'$$, 1, 'the signature records the signer and initials');
select t.count_is($$select count(*) from public.jobs where id = '40000000-0000-0000-0000-0000000000a2' and status = 'planning'$$, 1, 'signing moves the job from held to planning');
select t.count_is($$select count(*) from public.date_holds where job_id = '40000000-0000-0000-0000-0000000000a2' and status = 'confirmed'$$, 1, 'signing confirms the hold');

select t.login('office');
select t.count_is($$select count(*) from public.season_offers where season = 'Spring 2027' and stage = 'confirmed'$$, 1, 'signing confirms the season offer');
select t.count_is($$select count(*) from public.touchpoints where actor_kind = 'contact' and channel = 'portal'$$, 1, 'signing is logged as a touchpoint');
select t.count_is($$select count(*) from public.agent_events where kind = 'agreement.signed' and job_id = '40000000-0000-0000-0000-0000000000a2'$$, 1, 'signing wakes the agent');

-- ---------------------------------------------------------------------------
-- Wave A: season board and holds
-- ---------------------------------------------------------------------------
reset role;
insert into public.organizations (id, company_id, name) values
  ('20000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-00000000000a', 'League A2');
insert into public.jobs (id, company_id, org_id, name, expected_subjects, expected_teams) values
  ('40000000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', 'Job A3', 300, 24);
insert into public.photo_days (company_id, job_id, date, start_time, location_name) values
  ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a3', '2027-05-01', '09:00', 'Field A3');

select t.login('support');
select t.fails($$select public.build_season_board('Spring 2028')$$, 'support cannot build the season board');
select t.login('coord');
select t.fails($$select public.build_season_board('Spring 2028')$$, 'a coordinator cannot build the season board');

select t.login('office');
select t.fails($$select public.build_season_board('Spring 28')$$, 'the season must read like Spring 2028');
select t.count_is($$select public.build_season_board('Spring 2028')$$, 2, 'the board gets an offer for each league that ran last spring');
select t.count_is($$select public.build_season_board('Spring 2028')$$, 0, 'building again adds nothing new');
select t.count_is($$select count(*) from public.season_offers where season = 'Spring 2028' and org_id = '20000000-0000-0000-0000-0000000000a2' and priority_rank = 1 and tier = 'top'$$, 1, 'the bigger league ranks first and is top tier');
select t.count_is($$select count(*) from public.season_offers where season = 'Spring 2028' and org_id = '20000000-0000-0000-0000-0000000000a1' and priority_rank = 2 and tier = 'other'$$, 1, 'the smaller league ranks second');

select t.works($$select public.hold_date((select id from public.season_offers where season = 'Spring 2028' and org_id = '20000000-0000-0000-0000-0000000000a2'), '2028-04-15', 2::smallint)$$, 'office holds last year''s weekend for the top league');
select t.count_is($$select count(*) from public.jobs j join public.photo_days pd on pd.job_id = j.id
  where j.name = 'League A2 Spring 2028' and j.status = 'held' and j.expected_subjects = 300
    and pd.date = '2028-04-15' and pd.location_name = 'Field A3' and pd.start_time = '09:00'$$, 1, 'the held job and photo day copy last season''s details');
select t.count_is($$select count(*) from public.date_holds h join public.jobs j on j.id = h.job_id
  where j.name = 'League A2 Spring 2028' and h.status = 'held' and h.expires_on = current_date + 21$$, 1, 'a top-tier hold lasts 21 days');
select t.count_is($$select count(*) from public.season_offers where season = 'Spring 2028' and stage = 'held' and offered_at is not null$$, 1, 'the offer moves to held');
select t.fails($$select public.hold_date((select id from public.season_offers where season = 'Spring 2028' and org_id = '20000000-0000-0000-0000-0000000000a2'), '2028-04-22')$$, 'a league cannot hold two dates in one season');
select t.fails($$select public.hold_date((select id from public.season_offers where season = 'Spring 2028' and org_id = '20000000-0000-0000-0000-0000000000a1'), '2028-09-02')$$, 'a hold must fall in the offer''s season');
select t.fails($$select public.hold_date((select id from public.season_offers where season = 'Spring 2028' and org_id = '20000000-0000-0000-0000-0000000000a1'), '2028-04-15', 9::smallint)$$, 'a date with no stations left is refused');
select t.fails($$select public.hold_date((select id from public.season_offers where season = 'Spring 2028' and org_id = '20000000-0000-0000-0000-0000000000a1'), '2028-04-15', 9::smallint, true)$$, 'the office cannot overbook a date');
select t.works($$select public.hold_date((select id from public.season_offers where season = 'Spring 2028' and org_id = '20000000-0000-0000-0000-0000000000a1'), '2028-04-15', 2::smallint)$$, 'a second league shares the date while stations remain');
select t.count_is($$select stations_used from public.date_capacity where date = '2028-04-15'$$, 4, 'capacity shows both holds');
select t.count_is($$select count(*) from public.date_holds h join public.jobs j on j.id = h.job_id
  where j.name = 'League A1 Spring 2028' and h.expires_on = current_date + 14$$, 1, 'an other-tier hold lasts 14 days');
select t.count_is($$select count(*) from public.job_contacts jc join public.jobs j on j.id = jc.job_id where j.name = 'League A1 Spring 2028'$$, 1, 'the league''s contact carries over to the held job');
select t.fails($$select public.extend_hold((select h.id from public.date_holds h join public.jobs j on j.id = h.job_id where j.name = 'League A1 Spring 2028'))$$, 'the office cannot extend a hold');

select t.login('admin');
select t.count_is($$select (public.extend_hold((select h.id from public.date_holds h join public.jobs j on j.id = h.job_id where j.name = 'League A1 Spring 2028'), 7) - current_date)$$, 21, 'an admin extends a hold by a week');

select t.login('support');
select t.fails($$select public.release_hold((select h.id from public.date_holds h join public.jobs j on j.id = h.job_id where j.name = 'League A1 Spring 2028'))$$, 'support cannot release a hold');

select t.login('office');
select t.fails($$select public.release_hold((select h.id from public.date_holds h join public.jobs j on j.id = h.job_id where j.name = 'League A1 Spring 2028'), 'x', 'confirmed')$$, 'a release cannot mark the offer confirmed');
select t.works($$select public.release_hold((select h.id from public.date_holds h join public.jobs j on j.id = h.job_id where j.name = 'League A1 Spring 2028'), 'Two touches, no reply', 'no_reply')$$, 'office releases a hold after no reply');
select t.count_is($$select count(*) from public.jobs where name = 'League A1 Spring 2028' and status = 'released'$$, 1, 'the released job is marked released');
select t.count_is($$select count(*) from public.season_offers where season = 'Spring 2028' and org_id = '20000000-0000-0000-0000-0000000000a1' and stage = 'no_reply'$$, 1, 'the offer records no reply');
select t.count_is($$select stations_used from public.date_capacity where date = '2028-04-15'$$, 2, 'the released stations are free again');
select t.count_is($$select count(*) from public.touchpoints where summary like 'Hold released: Two touches%'$$, 1, 'the release is on the league timeline');

-- ---------------------------------------------------------------------------
-- Wave A: the daily clock and the approval queue
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', true);
select private.seed_clock_defaults('a0000000-0000-0000-0000-00000000000a');

select t.login('owner');
select t.fails($$select public.clock_due('a0000000-0000-0000-0000-00000000000a', current_date)$$, 'even the owner cannot run the daily clock');
reset role;
select set_config('request.jwt.claim.sub', '', true);

-- Holds: nothing due on day one, a reminder five days before, release after.
select t.count_is($$select jsonb_array_length(public.clock_due('a0000000-0000-0000-0000-00000000000a', current_date))$$, 0, 'nothing is due the day a hold is placed');
select t.count_is($$select count(*) from jsonb_array_elements(public.clock_due('a0000000-0000-0000-0000-00000000000a', current_date + 16)) e where e ->> 'kind' = 'holds.remind'$$, 1, 'a hold reminder is due five days before release');
insert into public.clock_log (company_id, key, kind, outcome, run_on)
select 'a0000000-0000-0000-0000-00000000000a', e ->> 'key', 'holds.remind', 'queued', current_date + 16
from jsonb_array_elements(public.clock_due('a0000000-0000-0000-0000-00000000000a', current_date + 16)) e where e ->> 'kind' = 'holds.remind';
select t.count_is($$select count(*) from jsonb_array_elements(public.clock_due('a0000000-0000-0000-0000-00000000000a', current_date + 17)) e where e ->> 'kind' = 'holds.remind'$$, 0, 'a reminder goes out once per hold window');
select t.count_is($$select count(*) from public.date_holds h join public.jobs j on j.id = h.job_id where j.name = 'League A2 Spring 2028' and h.status = 'held'$$, 1, 'the hold stands through its last day');
select t.works($$select public.clock_due('a0000000-0000-0000-0000-00000000000a', current_date + 22)$$, 'the clock runs the day after a hold lapses');
select t.count_is($$select count(*) from public.date_holds h join public.jobs j on j.id = h.job_id where j.name = 'League A2 Spring 2028' and h.status = 'held'$$, 0, 'a lapsed hold is released');
select t.count_is($$select count(*) from public.jobs where name = 'League A2 Spring 2028' and status = 'released'$$, 1, 'the lapsed job is released');
select t.count_is($$select count(*) from public.season_offers where season = 'Spring 2028' and stage = 'no_reply'$$, 2, 'the lapsed offer records no reply');
select t.count_is($$select count(*) from public.touchpoints where summary like 'Hold released: Hold lapsed%' and actor_kind = 'system'$$, 1, 'the timeline shows the platform released it');

-- The chase, on each job's own clock. Job A2 shoots 2027-04-24.
select t.count_is($$select count(*) from jsonb_array_elements(public.clock_due('a0000000-0000-0000-0000-00000000000a', '2027-02-26')) e where e ->> 'kind' like 'chase.%'$$, 0, 'no chase before eight weeks out');
select t.count_is($$select count(*) from jsonb_array_elements(public.clock_due('a0000000-0000-0000-0000-00000000000a', '2027-02-27')) e
  where e ->> 'kind' = 'chase.request' and e ->> 'job_id' = '40000000-0000-0000-0000-0000000000a2'
    and e ->> 'due_on' = '2027-04-03' and e -> 'missing' ? 'roster' and not e -> 'missing' ? 'agreement'$$, 1, 'eight weeks out the request is due, listing only what is missing');
insert into public.clock_log (company_id, key, kind, job_id, outcome, run_on)
values ('a0000000-0000-0000-0000-00000000000a', 'chase:40000000-0000-0000-0000-0000000000a2:request', 'chase.request', '40000000-0000-0000-0000-0000000000a2', 'queued', '2027-02-27');
select t.count_is($$select count(*) from jsonb_array_elements(public.clock_due('a0000000-0000-0000-0000-00000000000a', '2027-02-28')) e where e ->> 'job_id' = '40000000-0000-0000-0000-0000000000a2'$$, 0, 'a chase step is drafted once');
select t.count_is($$select count(*) from jsonb_array_elements(public.clock_due('a0000000-0000-0000-0000-00000000000a', '2027-03-27')) e
  where e ->> 'kind' = 'chase.due_soon' and e ->> 'job_id' = '40000000-0000-0000-0000-0000000000a2'$$, 1, 'four weeks out the due-in-one-week note is due');
select t.count_is($$select count(*) from public.tasks where job_id = '40000000-0000-0000-0000-0000000000a2' and title like 'Call %' and due_on = '2027-03-28'$$, 1, 'four weeks out a call task is created');
select t.count_is($$select count(*) from public.clock_log where key = 'chase:40000000-0000-0000-0000-0000000000a2:reminder' and outcome = 'skipped'$$, 1, 'a step whose day passed is skipped, not sent late');
select t.count_is($$select count(*) from jsonb_array_elements(public.clock_due('a0000000-0000-0000-0000-00000000000a', '2027-03-28')) e where e ->> 'kind' = 'chase.due_soon' and e ->> 'job_id' = '40000000-0000-0000-0000-0000000000a2'$$, 1, 'an undrafted step stays due until it is logged');
select t.count_is($$select count(*) from public.tasks where job_id = '40000000-0000-0000-0000-0000000000a2' and title like 'Call %'$$, 1, 'the call task is created once');

select t.count_is($$select count(*) from public.clock_log where key = 'chase:40000000-0000-0000-0000-0000000000a1:request' and outcome = 'not_needed'$$, 1, 'a job with nothing missing gets no chase');

-- The queue: staff decide, the streak counts clean approvals.
insert into public.agent_actions (id, company_id, action_type_key, actor_kind, status, draft) values
  ('70000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'chase.request', 'system', 'proposed', '{"subject": "S", "body": "B"}'),
  ('70000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-00000000000a', 'chase.request', 'system', 'proposed', '{"subject": "S", "body": "B"}'),
  ('70000000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-00000000000a', 'chase.at_risk', 'system', 'proposed', '{"subject": "S", "body": "B"}'),
  ('70000000-0000-0000-0000-0000000000a4', 'a0000000-0000-0000-0000-00000000000a', 'chase.reminder', 'system', 'proposed', '{"subject": "S", "body": "B"}');
insert into public.clock_log (company_id, key, kind, outcome, run_on) values ('a0000000-0000-0000-0000-00000000000a', 'test:visible', 'chase.request', 'queued', current_date);

select t.login('coord');
select t.fails($$select public.decide_action('70000000-0000-0000-0000-0000000000a1', true)$$, 'a coordinator cannot decide a queued action');
select t.count_is($$select count(*) from public.clock_log$$, 0, 'a coordinator cannot read the clock log');
select t.login('crew');
select t.fails($$select public.decide_action('70000000-0000-0000-0000-0000000000a1', true)$$, 'crew cannot decide a queued action');
select t.login('owner_b');
select t.fails($$select public.decide_action('70000000-0000-0000-0000-0000000000a1', true)$$, 'another company cannot decide this company''s action');

select t.login('support');
select t.count_is($$select count(*) from public.clock_log where key = 'test:visible'$$, 1, 'staff read the clock log');
select t.fails($$insert into public.clock_log (company_id, key, kind, outcome, run_on) values ('a0000000-0000-0000-0000-00000000000a', 'x', 'x', 'queued', current_date)$$, 'staff cannot write the clock log');
select t.count_is($$select (public.decide_action('70000000-0000-0000-0000-0000000000a1', true) = 'approved')::int$$, 1, 'support approves a chase draft');
select t.count_is($$select clean_streak from public.action_types where key = 'chase.request'$$, 1, 'a clean approval grows the streak');
select t.fails($$select public.decide_action('70000000-0000-0000-0000-0000000000a1', false)$$, 'an action is decided once');
select t.count_is($$select (public.decide_action('70000000-0000-0000-0000-0000000000a2', true, '{"subject": "S", "body": "Edited"}') = 'edited')::int$$, 1, 'an approval with changes is recorded as edited');
select t.count_is($$select clean_streak from public.action_types where key = 'chase.request'$$, 0, 'an edit resets the streak');
select t.count_is($$select count(*) from public.agent_actions where id = '70000000-0000-0000-0000-0000000000a2' and draft ->> 'body' = 'Edited' and decided_by = '10000000-0000-0000-0000-000000000004'$$, 1, 'the edited draft and who decided are kept');
select t.fails($$select public.decide_action('70000000-0000-0000-0000-0000000000a3', true)$$, 'support cannot decide a date-at-risk note');
select t.login('office');
select t.fails($$select public.decide_action('70000000-0000-0000-0000-0000000000a3', true)$$, 'the office cannot decide a date-at-risk note');
select t.count_is($$select (public.decide_action('70000000-0000-0000-0000-0000000000a4', false, null, 'Called them instead') = 'rejected')::int$$, 1, 'the office rejects a draft with a note');
select t.login('admin');
select t.count_is($$select (public.decide_action('70000000-0000-0000-0000-0000000000a3', true) = 'approved')::int$$, 1, 'an admin decides a date-at-risk note');

-- ---------------------------------------------------------------------------
-- League money terms
-- ---------------------------------------------------------------------------
select t.login('support');
select t.count_is($$with u as (update public.organization_terms set sponsorship = 'x' where org_id = '20000000-0000-0000-0000-0000000000a1' returning 1) select count(*) from u$$, 0, 'support cannot change league money terms');
select t.login('office');
select t.count_is($$with u as (update public.organization_terms set sponsorship = '$500 a season', rebate = '10% of sales' where org_id = '20000000-0000-0000-0000-0000000000a1' returning 1) select count(*) from u$$, 1, 'the office records league money terms');
select t.login('support');
select t.count_is($$select count(*) from public.organization_terms where org_id = '20000000-0000-0000-0000-0000000000a1' and rebate = '10% of sales'$$, 1, 'support reads league money terms');
select t.login('coord');
select t.count_is($$select count(*) from public.organization_terms$$, 0, 'a coordinator never sees league money terms');
select t.login('crew');
select t.count_is($$select count(*) from public.organization_terms$$, 0, 'crew never see league money terms');

-- ---------------------------------------------------------------------------
-- Wave A: planning form, roster paths and the scheduler helpers
-- ---------------------------------------------------------------------------
select t.login('coord');
select t.works($$select public.save_planning_form('40000000-0000-0000-0000-0000000000a1', '{"setup": "indoors"}', false)$$, 'coordinator saves planning answers');
select t.fails($$select public.save_planning_form('40000000-0000-0000-0000-0000000000a3', '{"setup": "indoors"}', false)$$, 'coordinator cannot fill in another job''s form');
select t.fails($$select public.save_planning_form('40000000-0000-0000-0000-0000000000a1', '[]', false)$$, 'planning answers must be an object');
select t.fails($$insert into public.roster_files (company_id, job_id, storage_path, file_name, mime_type, size_bytes, uploaded_by) values ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-0000000000a3/x.csv', 'x.csv', 'text/csv', 10, auth.uid())$$, 'a roster row cannot point at another job''s file');
select t.fails($$insert into public.roster_files (company_id, job_id, storage_path, file_name, mime_type, size_bytes, uploaded_by) values ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-0000000000a1/x.exe', 'x.exe', 'application/octet-stream', 10, auth.uid())$$, 'a roster file of another type is refused');
select t.count_is($$select count(*) from public.schedules where id = public.open_schedule((select id from public.photo_days where job_id = '40000000-0000-0000-0000-0000000000a1'))$$, 1, 'opening a schedule twice returns the same one');
select t.fails($$select public.open_schedule((select id from public.photo_days where job_id = '40000000-0000-0000-0000-0000000000a3'))$$, 'coordinator cannot open another job''s schedule');
select t.fails($$select public.set_schedule_status('80000000-0000-0000-0000-0000000000a1', 'complete')$$, 'coordinator cannot mark a schedule complete');
select t.works($$update public.schedule_slots set minutes = 10 where team_id = '70000000-0000-0000-0000-0000000000a4'$$, 'coordinator changes a slot after submitting');
select t.count_is($$select count(*) from public.schedules where id = '80000000-0000-0000-0000-0000000000a1' and status = 'started' and submitted_at is null$$, 1, 'a change after submitting reopens the schedule');
select t.works($$select public.submit_schedule('80000000-0000-0000-0000-0000000000a1')$$, 'coordinator submits again');
select t.login('office');
select t.works($$select public.set_schedule_status('80000000-0000-0000-0000-0000000000a1', 'complete')$$, 'office marks the schedule complete');
select t.works($$update public.schedule_slots set minutes = 15 where team_id = '70000000-0000-0000-0000-0000000000a4'$$, 'office edits a slot');
select t.count_is($$select count(*) from public.schedules where id = '80000000-0000-0000-0000-0000000000a1' and status = 'complete'$$, 1, 'an office edit leaves the schedule complete');
select t.fails($$select public.set_schedule_status('80000000-0000-0000-0000-0000000000a1', 'submitted')$$, 'only complete or started can be set');
select t.works($$insert into public.teams (company_id, job_id, name, source) values ('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 'Late Team', 'office')$$, 'office adds a late team');
select t.count_is($$select count(*) from public.schedules where id = '80000000-0000-0000-0000-0000000000a1' and status = 'started'$$, 1, 'a new team reopens a complete schedule');
select t.count_is($$select count(*) from public.planning_due('40000000-0000-0000-0000-0000000000a1') where weeks_due = 3 and deadline_days = 10$$, 1, 'the planning dates read from settings');
select t.login('crew');
select t.fails($$select public.save_planning_form('40000000-0000-0000-0000-0000000000a1', '{}', true)$$, 'crew cannot fill in a planning form');

-- ---------------------------------------------------------------------------
-- The finished roster file: office only, this job's file only
-- ---------------------------------------------------------------------------
select t.login('coord');
select t.fails($$select public.import_standard_roster('40000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-0000000000a1/standard/x.csv', '[{"group":"U8 - Tigers - Smith","name":"Tigers","division":"U8","coach":"Coach Smith","sponsor":null,"players":11},{"group":"U8 - Lions - Jones","name":"Lions","division":"U8","coach":"Coach Jones","sponsor":"Pizza Place","players":9}]', 20)$$, 'coordinator cannot import a finished roster');
select t.login('crew');
select t.fails($$select public.import_standard_roster('40000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-0000000000a1/standard/x.csv', '[{"group":"U8 - Tigers - Smith","name":"Tigers","division":"U8","coach":"Coach Smith","sponsor":null,"players":11},{"group":"U8 - Lions - Jones","name":"Lions","division":"U8","coach":"Coach Jones","sponsor":"Pizza Place","players":9}]', 20)$$, 'crew cannot import a finished roster');
select t.login('office');
select t.fails($$select public.import_standard_roster('40000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-0000000000a3/standard/x.csv', '[{"group":"U8 - Tigers - Smith","name":"Tigers","division":"U8","coach":"Coach Smith","sponsor":null,"players":11},{"group":"U8 - Lions - Jones","name":"Lions","division":"U8","coach":"Coach Jones","sponsor":"Pizza Place","players":9}]', 20)$$, 'a roster import cannot point at another job''s file');
select t.fails($$select public.import_standard_roster('40000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-0000000000a1/standard/x.csv', '{}', 20)$$, 'a roster import needs a list of teams');
select t.works($$select public.import_standard_roster('40000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-0000000000a1/standard/x.csv', '[{"group":"U8 - Tigers - Smith","name":"Tigers","division":"U8","coach":"Coach Smith","sponsor":null,"players":11},{"group":"U8 - Lions - Jones","name":"Lions","division":"U8","coach":"Coach Jones","sponsor":"Pizza Place","players":9}]', 20)$$, 'office imports a finished roster');
select t.count_is($$select count(*) from public.teams where job_id = '40000000-0000-0000-0000-0000000000a1' and source = 'roster' and roster_group is not null$$, 2, 'the roster''s teams are on the job');
select t.count_is($$select count(*) from public.photo_day_readiness where job_id = '40000000-0000-0000-0000-0000000000a1' and roster = 'standardized'$$, 1, 'the roster reads as standardized');
select t.works($$select public.import_standard_roster('40000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-0000000000a1/standard/y.csv', '[{"group":"U8 - Tigers - Smith","name":"Tigers","division":"U8","coach":"Coach Smith","sponsor":null,"players":12}]', 20)$$, 'office imports a newer roster');
select t.count_is($$select count(*) from public.teams where job_id = '40000000-0000-0000-0000-0000000000a1' and roster_group = 'U8 - Lions - Jones'$$, 0, 'a team the new roster dropped is removed');
select t.count_is($$select count(*) from public.teams where job_id = '40000000-0000-0000-0000-0000000000a1' and roster_group = 'U8 - Tigers - Smith' and player_count = 12$$, 1, 'a team in both rosters is updated, not doubled');
select t.count_is($$select count(*) from public.roster_versions where job_id = '40000000-0000-0000-0000-0000000000a1' and status = 'ready'$$, 1, 'only the newest roster is the ready one');
select t.count_is($$select count(*) from public.roster_versions where job_id = '40000000-0000-0000-0000-0000000000a1' and status = 'superseded' and csv_path like '%/standard/x.csv'$$, 1, 'the earlier roster is superseded');

-- Ask SNAP: staff only, one question at a time each, stopped at the day's cap.
select t.login('coord');
select t.fails($$select public.ask_snap_begin('How many jobs are in planning?')$$, 'a coordinator cannot use Ask SNAP');
select t.fails($$select public.ask_snap_status()$$, 'a coordinator cannot read Ask SNAP spend');
select t.login('office');
select t.count_is($$select count(*) from (select public.ask_snap_begin('How many jobs are in planning?') as r) s where r ->> 'stop' = 'off'$$, 1, 'Ask SNAP is off until a cap is set');
select t.login('admin');
select t.works($$insert into public.settings (company_id, key, value) values ('a0000000-0000-0000-0000-00000000000a', 'agent.daily_budget_usd', '1')$$, 'admin sets the daily cap');
select t.login('office');
select t.fails($$select public.ask_snap_finish((public.ask_snap_begin('q') ->> 'run_id')::uuid, true, 'm', 'a', 1, 10, 10, 9, null)$$, 'a question cannot record an absurd cost');
select t.works($$select public.ask_snap_finish((public.ask_snap_begin('How many jobs are in planning?') ->> 'run_id')::uuid, true, 'm', 'Two.', 1, 100, 20, 0.4, null)$$, 'office asks and the run is recorded');
select t.count_is($$select count(*) from (select public.ask_snap_begin('still thinking') as r) s where r ->> 'run_id' is not null$$, 1, 'office asks again under the cap');
select t.count_is($$select count(*) from (select public.ask_snap_begin('a second at once') as r) s where r ->> 'stop' = 'busy'$$, 1, 'one question at a time per person');
select t.login('support');
select t.fails($$select public.ask_snap_finish(gen_random_uuid(), true, 'm', 'a', 0, 0, 0, 0, null)$$, 'nobody closes a question that is not theirs');
select t.works($$select public.ask_snap_finish((public.ask_snap_begin('Who has not sent a roster?') ->> 'run_id')::uuid, true, 'm', 'Nobody.', 2, 100, 20, 0.7, null)$$, 'support asks');
select t.count_is($$select count(*) from (select public.ask_snap_begin('one more') as r) s where r ->> 'stop' = 'day'$$, 1, 'the daily cap stops the next question');
select t.count_is($$select count(*) from public.agent_runs$$, 0, 'support cannot read the run log');
select t.login('crew');
select t.fails($$select public.ask_snap_begin('one more')$$, 'crew cannot use Ask SNAP');
select t.login('admin');
select t.count_is($$select count(*) from public.agent_runs where trigger = 'ask_snap'$$, 3, 'admin reads every Ask SNAP run');
select t.count_is($$select count(*) from (select public.ask_snap_status() as r) s where (r ->> 'spent_today')::numeric = 1.1 and (r ->> 'daily_cap')::numeric = 1$$, 1, 'the status shows the day''s spend and cap');

-- ---------------------------------------------------------------------------
-- The Wave A exit line, start to finish on one league: a held date, a signed
-- agreement, a complete schedule in the portal, and the chase on the right days.
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', true);
insert into public.organizations (id, company_id, name) values
  ('20000000-0000-0000-0000-0000000000a9', 'a0000000-0000-0000-0000-00000000000a', 'League A9');
insert into public.season_offers (company_id, org_id, season, stage, tier) values
  ('a0000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a9', 'Spring 2029', 'offered', 'other');

select t.login('office');
select t.works($$select public.hold_date((select id from public.season_offers where season = 'Spring 2029'), '2029-04-14', 1::smallint)$$, 'exit: the office holds a date for the league');
select t.count_is($$select count(*) from public.jobs where name = 'League A9 Spring 2029' and status = 'held'$$, 1, 'exit: the job starts as held');

reset role;
insert into public.portal_links (company_id, job_id, contact_id, token_hash, expires_at)
  select 'a0000000-0000-0000-0000-00000000000a', id, '30000000-0000-0000-0000-0000000000a2', 'hash-a9', now() + interval '30 days'
  from public.jobs where name = 'League A9 Spring 2029';
select t.works($$select public.portal_admit((select id from public.portal_links where token_hash = 'hash-a9'), '10000000-0000-0000-0000-000000000006')$$, 'exit: the coordinator opens the portal link');

select t.login('coord');
select t.works($$select public.sign_agreement((select id from public.jobs where name = 'League A9 Spring 2029'), '60000000-0000-0000-0000-0000000000a1', 'Coord Person', '{"fees": "CP"}')$$, 'exit: the coordinator signs the agreement');
select t.count_is($$select count(*) from public.jobs where name = 'League A9 Spring 2029' and status = 'planning'$$, 1, 'exit: the signed job moves to planning');

reset role;
select set_config('request.jwt.claim.sub', '', true);
select t.count_is($$select count(*) from jsonb_array_elements(public.clock_due('a0000000-0000-0000-0000-00000000000a', '2029-02-16')) e where e ->> 'job_id' = (select id from public.jobs where name = 'League A9 Spring 2029')::text$$, 0, 'exit: no chase the day before eight weeks out');
select t.count_is($$select count(*) from jsonb_array_elements(public.clock_due('a0000000-0000-0000-0000-00000000000a', '2029-02-17')) e
  where e ->> 'kind' = 'chase.request' and e ->> 'job_id' = (select id from public.jobs where name = 'League A9 Spring 2029')::text and e ->> 'due_on' = '2029-03-24'
    and e -> 'missing' = '["planning_form", "roster", "schedule"]'$$, 1, 'exit: eight weeks out the request is drafted for the form, roster and schedule');

select t.login('coord');
select t.works($$select public.save_planning_form((select id from public.jobs where name = 'League A9 Spring 2029'), '{"setup": "outdoors"}', true)$$, 'exit: the coordinator submits the planning form');
select t.login('office');
select t.works($$select public.import_standard_roster((select id from public.jobs where name = 'League A9 Spring 2029'), 'a0000000-0000-0000-0000-00000000000a/' || (select id from public.jobs where name = 'League A9 Spring 2029')::text || '/standard/final.csv', '[{"group":"U10 - Bears - Lee","name":"Bears","division":"U10","coach":"Coach Lee","sponsor":null,"players":12},{"group":"U10 - Wolves - Diaz","name":"Wolves","division":"U10","coach":"Coach Diaz","sponsor":null,"players":11}]', 23)$$, 'exit: the office uploads the finished roster');

select t.login('coord');
select t.works($$select public.open_schedule((select id from public.photo_days where job_id = (select id from public.jobs where name = 'League A9 Spring 2029')))$$, 'exit: the coordinator opens the schedule');
select t.fails($$select public.submit_schedule((select id from public.schedules where job_id = (select id from public.jobs where name = 'League A9 Spring 2029')))$$, 'exit: a schedule with unplaced teams cannot be submitted');
select t.works($$insert into public.schedule_slots (company_id, job_id, schedule_id, station, starts_at, minutes, team_id)
  select s.company_id, s.job_id, s.id, 1, time '09:00' + (row_number() over (order by tm.name) - 1) * interval '15 minutes', 15, tm.id
  from public.schedules s join public.teams tm on tm.job_id = s.job_id where s.job_id = (select id from public.jobs where name = 'League A9 Spring 2029')$$, 'exit: the coordinator places both teams');
select t.works($$select public.submit_schedule((select id from public.schedules where job_id = (select id from public.jobs where name = 'League A9 Spring 2029')))$$, 'exit: the coordinator submits the schedule');
select t.login('office');
select t.works($$select public.set_schedule_status((select id from public.schedules where job_id = (select id from public.jobs where name = 'League A9 Spring 2029')), 'complete')$$, 'exit: the office approves the schedule');
select t.count_is($$select count(*) from public.photo_day_readiness where job_id = (select id from public.jobs where name = 'League A9 Spring 2029')
  and agreement_signed and planning_form = 'submitted' and roster = 'standardized' and schedule = 'complete'$$, 1, 'exit: the photo day reads as ready on every step');

reset role;
select set_config('request.jwt.claim.sub', '', true);
select t.count_is($$select count(*) from jsonb_array_elements(public.clock_due('a0000000-0000-0000-0000-00000000000a', '2029-03-10')) e where e ->> 'job_id' = (select id from public.jobs where name = 'League A9 Spring 2029')::text$$, 0, 'exit: five weeks out nothing is chased once everything is in');
select t.count_is($$select count(*) from public.clock_log where key = 'chase:' || (select id from public.jobs where name = 'League A9 Spring 2029')::text || ':reminder' and outcome = 'not_needed'$$, 1, 'exit: the clock records that no reminder was needed');

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
