-- =============================================================================
-- Wave B, module 8: gear and the field view.
-- Kits (A to K at SNAP) go out per photo day against one master checklist and
-- come back with anything missing or broken logged. Camera bodies are tracked
-- by serial and letter. The field view gives the crew on a day, and staff,
-- everything they need on a phone.
-- =============================================================================

create table public.kits (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  code        text not null check (code ~ '^[A-Za-z0-9-]{1,10}$'),
  name        text check (char_length(name) <= 100),
  status      text not null default 'ready' check (status in ('ready', 'needs_service', 'retired')),
  notes       text check (char_length(notes) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, code)
);

create table public.kit_checklist_items (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  section       text not null check (char_length(section) <= 100),
  name          text not null check (char_length(name) <= 200),
  position      int not null default 0,
  outdoor_only  boolean not null default false,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index kit_checklist_items_company_idx on public.kit_checklist_items (company_id, position);

create table public.camera_bodies (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  serial      text not null check (char_length(serial) between 1 and 40),
  letter      text check (char_length(letter) <= 4),
  model       text check (char_length(model) <= 60),
  kit_id      uuid references public.kits(id) on delete set null,
  active      boolean not null default true,
  notes       text check (char_length(notes) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, serial)
);
create index camera_bodies_kit_idx on public.camera_bodies (kit_id);

create table public.kit_checkouts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  job_id        uuid not null references public.jobs(id) on delete cascade,
  photo_day_id  uuid not null references public.photo_days(id) on delete cascade,
  kit_id        uuid not null references public.kits(id) on delete cascade,
  station       smallint check (station between 1 and 20),
  status        text not null default 'planned' check (status in ('planned', 'out', 'back')),
  out_at        timestamptz,
  out_by        uuid references public.profiles(id) on delete set null,
  back_at       timestamptz,
  back_by       uuid references public.profiles(id) on delete set null,
  missing       text[] not null default '{}',
  issues        text check (char_length(issues) <= 2000),
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (kit_id, photo_day_id)
);
create index kit_checkouts_day_idx on public.kit_checkouts (photo_day_id);
create index kit_checkouts_job_idx on public.kit_checkouts (job_id);
create index kit_checkouts_company_idx on public.kit_checkouts (company_id, status);
create index kit_checkouts_out_by_idx on public.kit_checkouts (out_by);
create index kit_checkouts_back_by_idx on public.kit_checkouts (back_by);
create index kit_checkouts_created_by_idx on public.kit_checkouts (created_by);

-- Company and job from the photo day; one place per kit per date; who took it
-- out and brought it back; a kit that comes back short or broken needs service.
create or replace function private.kit_checkout_stamp()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_day public.photo_days%rowtype;
begin
  select * into v_day from public.photo_days where id = new.photo_day_id;
  if v_day.id is null then
    raise exception 'photo day not found';
  end if;
  if tg_op = 'UPDATE' and (new.photo_day_id <> old.photo_day_id or new.kit_id <> old.kit_id) then
    raise exception 'make a new checkout to move a kit';
  end if;
  new.company_id := v_day.company_id;
  new.job_id := v_day.job_id;
  if not exists (select 1 from public.kits k where k.id = new.kit_id and k.company_id = new.company_id) then
    raise exception 'kit not found';
  end if;
  if exists (
    select 1 from public.kit_checkouts c
    join public.photo_days d on d.id = c.photo_day_id
    where c.kit_id = new.kit_id and c.id <> new.id and d.date = v_day.date and c.status <> 'back'
  ) then
    raise exception 'that kit is already going to another photo day that date';
  end if;
  if new.status in ('out', 'back') and (tg_op = 'INSERT' or old.status = 'planned') then
    new.out_at := coalesce(new.out_at, now());
    new.out_by := coalesce(new.out_by, auth.uid());
  end if;
  if new.status = 'back' and (tg_op = 'INSERT' or old.status <> 'back') then
    new.back_at := now();
    new.back_by := auth.uid();
  end if;
  if new.status = 'planned' then
    new.out_at := null; new.out_by := null; new.back_at := null; new.back_by := null;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;
revoke all on function private.kit_checkout_stamp() from public;

create or replace function private.kit_back_needs_service()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'back' and (cardinality(new.missing) > 0 or coalesce(btrim(new.issues), '') <> '') then
    update public.kits set status = 'needs_service' where id = new.kit_id and status = 'ready';
  end if;
  return null;
end;
$$;
revoke all on function private.kit_back_needs_service() from public;

create trigger kit_checkouts_stamp before insert or update on public.kit_checkouts
  for each row execute function private.kit_checkout_stamp();
create trigger kit_checkouts_service after insert or update on public.kit_checkouts
  for each row execute function private.kit_back_needs_service();

create trigger kits_updated_at before update on public.kits
  for each row execute function private.set_updated_at();
create trigger kit_checklist_items_updated_at before update on public.kit_checklist_items
  for each row execute function private.set_updated_at();
create trigger camera_bodies_updated_at before update on public.camera_bodies
  for each row execute function private.set_updated_at();
create trigger kit_checkouts_updated_at before update on public.kit_checkouts
  for each row execute function private.set_updated_at();
create trigger kits_log after insert or update or delete on public.kits
  for each row execute function private.log_row_change();
create trigger camera_bodies_log after insert or update or delete on public.camera_bodies
  for each row execute function private.log_row_change();
create trigger kit_checkouts_log after insert or update or delete on public.kit_checkouts
  for each row execute function private.log_row_change();

-- RLS: staff read; owner, admin and office keep the gear; owner and admin delete
-- kits, bodies and checklist lines (retire or deactivate them instead).
alter table public.kits enable row level security;
alter table public.kit_checklist_items enable row level security;
alter table public.camera_bodies enable row level security;
alter table public.kit_checkouts enable row level security;

grant select, insert, update, delete on public.kits, public.kit_checklist_items, public.camera_bodies, public.kit_checkouts to authenticated;
grant all on public.kits, public.kit_checklist_items, public.camera_bodies, public.kit_checkouts to service_role;

do $$
declare
  t text;
begin
  foreach t in array array['kits', 'kit_checklist_items', 'camera_bodies', 'kit_checkouts'] loop
    execute format($p$create policy %1$s_select on public.%1$I for select to authenticated
      using (company_id = (select private.current_company_id()) and (select private.is_staff()))$p$, t);
    execute format($p$create policy %1$s_insert on public.%1$I for insert to authenticated
      with check (company_id = (select private.current_company_id()) and (select private.can_edit_ops()))$p$, t);
    execute format($p$create policy %1$s_update on public.%1$I for update to authenticated
      using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()))
      with check (company_id = (select private.current_company_id()))$p$, t);
  end loop;
end;
$$;
create policy kits_delete on public.kits for delete to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));
create policy kit_checklist_items_delete on public.kit_checklist_items for delete to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));
create policy camera_bodies_delete on public.camera_bodies for delete to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_owner_or_admin()));
-- A planned checkout can be taken back off the day; one that went out stays on record.
create policy kit_checkouts_delete on public.kit_checkouts for delete to authenticated
  using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()) and status = 'planned');

-- ---------------------------------------------------------------------------
-- The field view: one photo day for its crew and for staff. Crew get no
-- direct read on jobs, photo days or contacts; this returns only the day they
-- work. Staff also see crew phone numbers.
-- ---------------------------------------------------------------------------
create or replace function public.field_view(p_photo_day uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_day public.photo_days%rowtype;
  v_job public.jobs%rowtype;
  v_staff boolean;
  v_crew uuid;
begin
  select * into v_day from public.photo_days where id = p_photo_day;
  if v_day.id is null or v_day.company_id <> private.current_company_id() then
    return null;
  end if;
  v_staff := private.is_staff();
  v_crew := private.my_crew_member_id();
  if not v_staff and not exists (
    select 1 from public.shifts s where s.photo_day_id = v_day.id and s.crew_member_id = v_crew and s.status = 'filled'
  ) then
    return null;
  end if;
  select * into v_job from public.jobs where id = v_day.job_id;

  return jsonb_build_object(
    'staff', v_staff,
    'day', jsonb_build_object(
      'id', v_day.id, 'date', v_day.date, 'status', v_day.status, 'start_time', v_day.start_time, 'end_time', v_day.end_time,
      'label', v_day.label, 'location_name', v_day.location_name, 'address', v_day.address, 'city', v_day.city,
      'state', v_day.state, 'zip', v_day.zip, 'location_details', v_day.location_details, 'indoor', v_day.indoor,
      'alt_indoor_location', v_day.alt_indoor_location, 'notes', v_day.notes, 'stations', v_day.stations),
    'job', jsonb_build_object(
      'id', v_job.id, 'name', v_job.name, 'sports', v_job.sports, 'team_photo_type', v_job.team_photo_type,
      'expected_teams', v_job.expected_teams, 'expected_subjects', v_job.expected_subjects, 'notes', v_job.notes),
    'crew', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', c.full_name, 'position', s.position, 'station', s.station,
               'start_time', s.start_time, 'end_time', s.end_time, 'me', c.id = v_crew,
               'phone', case when v_staff then c.phone end)
             order by s.position, s.station nulls last, c.full_name)
      from public.shifts s join public.crew_members c on c.id = s.crew_member_id
      where s.photo_day_id = v_day.id and s.status = 'filled'), '[]'::jsonb),
    'kits', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', k.code, 'station', o.station, 'status', o.status,
               'cameras', (select coalesce(jsonb_agg(coalesce(b.letter || ' ', '') || coalesce(b.model, '') order by b.letter), '[]'::jsonb)
                           from public.camera_bodies b where b.kit_id = k.id and b.active))
             order by o.station nulls last, k.code)
      from public.kit_checkouts o join public.kits k on k.id = o.kit_id
      where o.photo_day_id = v_day.id), '[]'::jsonb),
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object('name', ct.full_name, 'role', jc.role, 'phone', ct.phone, 'email', ct.email) order by ct.full_name)
      from public.job_contacts jc join public.contacts ct on ct.id = jc.contact_id
      where jc.job_id = v_job.id), '[]'::jsonb),
    'schedule', coalesce((
      select jsonb_agg(jsonb_build_object(
               'station', sl.station, 'starts_at', sl.starts_at, 'minutes', sl.minutes, 'kind', sl.kind,
               'label', coalesce(t.name || coalesce(' (' || t.division || ')', ''), sl.label), 'players', t.player_count)
             order by sl.starts_at, sl.station)
      from public.schedules sc join public.schedule_slots sl on sl.schedule_id = sc.id
      left join public.teams t on t.id = sl.team_id
      where sc.photo_day_id = v_day.id), '[]'::jsonb),
    'checklist', coalesce((
      select jsonb_agg(jsonb_build_object('section', i.section, 'name', i.name, 'outdoor_only', i.outdoor_only) order by i.position, i.name)
      from public.kit_checklist_items i
      where i.company_id = v_day.company_id and i.active
        and (not i.outdoor_only or v_day.indoor is distinct from true)), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.field_view(uuid) from public, anon;
grant execute on function public.field_view(uuid) to authenticated;
