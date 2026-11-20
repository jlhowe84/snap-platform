-- Wave B, module 13 (part one): the public photo day page and the parent help
-- center.
--
-- A job gets at most one public page, reached by an unguessable slug. It is
-- off until the office publishes it. Anyone with the link sees only what a
-- parent needs: the photo days (date, times, place, status), what to wear and
-- bring, the prepay link and coupon, and, once the league has submitted the
-- schedule, team names and times. Never player names, coaches, contacts or
-- notes.
--
-- The help center shows knowledge base answers the office has marked for it.
-- Nothing is public until someone turns it on.
--
-- Visitors are not signed in, so both are read through security definer
-- functions granted to anon; the tables themselves stay closed to anon.

create table public.day_pages (
  job_id         uuid primary key references public.jobs(id) on delete cascade,
  company_id     uuid not null references public.companies(id) on delete cascade,
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 6 and 80),
  published      boolean not null default false,
  published_at   timestamptz,
  show_team_times boolean not null default true,
  what_to_wear   text check (what_to_wear is null or length(what_to_wear) <= 2000),
  what_to_bring  text check (what_to_bring is null or length(what_to_bring) <= 2000),
  note           text check (note is null or length(note) <= 2000),
  updated_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index day_pages_company_idx on public.day_pages (company_id);
create index day_pages_updated_by_idx on public.day_pages (updated_by);

-- The page's job must be in the page's company (the policies trust company_id).
create or replace function private.day_page_stamp()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.jobs j where j.id = new.job_id and j.company_id = new.company_id) then
    raise exception 'page job is not in this company';
  end if;
  new.updated_by := auth.uid();
  if new.published and (tg_op = 'INSERT' or not old.published) then
    new.published_at := now();
  end if;
  return new;
end;
$$;
revoke all on function private.day_page_stamp() from public;
create trigger day_pages_stamp before insert or update on public.day_pages
  for each row execute function private.day_page_stamp();
create trigger day_pages_updated_at before update on public.day_pages
  for each row execute function private.set_updated_at();
create trigger day_pages_log after insert or update or delete on public.day_pages
  for each row execute function private.log_row_change();

alter table public.day_pages enable row level security;
grant select, insert, update, delete on public.day_pages to authenticated;
grant all on public.day_pages to service_role;
create policy day_pages_select on public.day_pages for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_staff()));
create policy day_pages_insert on public.day_pages for insert to authenticated
  with check (company_id = (select private.current_company_id()) and (select private.can_edit_ops()));
create policy day_pages_update on public.day_pages for update to authenticated
  using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()))
  with check (company_id = (select private.current_company_id()));
create policy day_pages_delete on public.day_pages for delete to authenticated
  using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()));

-- Which answers appear on the help center. Off for every existing article.
alter table public.kb_articles add column on_help_center boolean not null default false;

-- ---------------------------------------------------------------------------
-- What a visitor sees. Null when the slug is unknown or the page is off.
-- ---------------------------------------------------------------------------
create or replace function public.public_day_page(p_slug text)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_page public.day_pages%rowtype;
  v_job public.jobs%rowtype;
begin
  select * into v_page from public.day_pages where slug = lower(p_slug) and published;
  if not found then
    return null;
  end if;
  select * into v_job from public.jobs where id = v_page.job_id;
  if v_job.status in ('cancelled', 'archived') then
    return null;
  end if;

  return jsonb_build_object(
    'company', (select jsonb_build_object('name', c.name, 'slug', c.slug) from public.companies c where c.id = v_job.company_id),
    'league', (select o.name from public.organizations o where o.id = v_job.org_id),
    'job', v_job.name,
    'sports', to_jsonb(v_job.sports),
    'coupon', v_job.coupon,
    'shop_url', (select l.online_shop_url from public.job_links l where l.job_id = v_job.id),
    'what_to_wear', v_page.what_to_wear,
    'what_to_bring', v_page.what_to_bring,
    'note', v_page.note,
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', d.id,
          'date', d.date,
          'status', d.status,
          'label', d.label,
          'start_time', d.start_time,
          'end_time', d.end_time,
          'location_name', d.location_name,
          'address', d.address,
          'city', d.city,
          'state', d.state,
          'zip', d.zip,
          'location_details', d.location_details,
          'indoor', d.indoor,
          'alt_indoor_location', d.alt_indoor_location,
          'teams', case when v_page.show_team_times and s.status in ('submitted', 'complete') then coalesce((
              select jsonb_agg(jsonb_build_object('team', t.name, 'division', t.division, 'time', ss.starts_at)
                               order by ss.starts_at, t.name)
              from public.schedule_slots ss
              join public.teams t on t.id = ss.team_id
              where ss.schedule_id = s.id and ss.kind = 'team'), '[]'::jsonb)
            else null end
        ) order by d.date, d.start_time)
      from public.photo_days d
      left join public.schedules s on s.photo_day_id = d.id
      where d.job_id = v_job.id), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.public_day_page(text) from public;
grant execute on function public.public_day_page(text) to anon, authenticated, service_role;

-- The help center: published answers marked for it, optionally matched to a
-- search. Null company means the slug is unknown.
create or replace function public.public_help_articles(p_company_slug text, p_query text default null)
returns table (id uuid, section text, title text, body text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.section, a.title, a.body
  from public.kb_articles a
  join public.companies c on c.id = a.company_id
  where c.slug = lower(p_company_slug)
    and a.shelf = 'answers'
    and a.status = 'published'
    and a.on_help_center
    and (coalesce(trim(p_query), '') = ''
         or a.search @@ websearch_to_tsquery('english', left(p_query, 200)))
  order by
    case when coalesce(trim(p_query), '') = '' then 0
         else -ts_rank(a.search, websearch_to_tsquery('english', left(p_query, 200))) end,
    a.section nulls last, a.position, a.title
  limit 200;
$$;
revoke all on function public.public_help_articles(text, text) from public;
grant execute on function public.public_help_articles(text, text) to anon, authenticated, service_role;

-- The company's display name for the help center header; null when unknown.
create or replace function public.public_company(p_company_slug text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', c.name, 'slug', c.slug)
  from public.companies c where c.slug = lower(p_company_slug);
$$;
revoke all on function public.public_company(text) from public;
grant execute on function public.public_company(text) to anon, authenticated, service_role;
