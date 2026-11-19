-- Wave B: the knowledge base.
--
-- One article per question or topic, on one of three shelves:
--   answers  - what parents ask, in the company's approved wording. Feeds the
--              support drafts now and the parent help center later.
--   support  - how the desk works: voice, handling rules, reply templates,
--              company facts, and the questions with no settled answer yet.
--   handbook - staff procedures (production, gear, the on-site process).
-- Articles are never deleted: they are retired. Every change keeps the
-- earlier wording as a numbered version.
--
-- Staff (owner, admin, office, support) read. Owner, admin and office write.

create type public.kb_shelf as enum ('answers', 'support', 'handbook');
create type public.kb_status as enum ('published', 'draft', 'retired');

create table public.kb_articles (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  shelf       public.kb_shelf not null default 'answers',
  section     text check (section is null or length(trim(section)) between 1 and 120),
  title       text not null check (length(trim(title)) between 1 and 200),
  body        text not null check (length(body) between 1 and 20000),
  status      public.kb_status not null default 'published',
  position    integer not null default 0,
  version     integer not null default 1,
  created_by  uuid references public.profiles(id) on delete set null,
  updated_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  search      tsvector generated always as (
                setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                setweight(to_tsvector('english', coalesce(section, '')), 'B') ||
                setweight(to_tsvector('english', coalesce(body, '')), 'C')) stored
);
create index kb_articles_company_idx on public.kb_articles (company_id, shelf, status, position);
create index kb_articles_search_idx on public.kb_articles using gin (search);
create index kb_articles_created_by_idx on public.kb_articles (created_by);
create index kb_articles_updated_by_idx on public.kb_articles (updated_by);

create table public.kb_article_versions (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  article_id  uuid not null references public.kb_articles(id) on delete cascade,
  version     integer not null,
  shelf       public.kb_shelf not null,
  section     text,
  title       text not null,
  body        text not null,
  status      public.kb_status not null,
  edited_by   uuid references public.profiles(id) on delete set null,
  edited_at   timestamptz not null default now(),
  unique (article_id, version)
);
create index kb_article_versions_company_idx on public.kb_article_versions (company_id);
create index kb_article_versions_edited_by_idx on public.kb_article_versions (edited_by);

-- Who and which version are the database's to set, not the editor's.
create or replace function private.kb_article_stamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.updated_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    new.company_id := old.company_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if (new.title, new.body, new.section, new.shelf, new.status) is distinct from
       (old.title, old.body, old.section, old.shelf, old.status) then
      new.version := old.version + 1;
    else
      new.version := old.version;
    end if;
    new.updated_by := coalesce(auth.uid(), old.updated_by);
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Each version is kept as it was written. Readers see them; nobody edits them.
create or replace function private.kb_article_keep_version()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.version <> old.version then
    insert into public.kb_article_versions
      (company_id, article_id, version, shelf, section, title, body, status, edited_by)
    values (new.company_id, new.id, new.version, new.shelf, new.section, new.title, new.body, new.status, new.updated_by);
  end if;
  return null;
end;
$$;
revoke all on function private.kb_article_keep_version() from public;

create trigger kb_articles_stamp before insert or update on public.kb_articles
  for each row execute function private.kb_article_stamp();
create trigger kb_articles_keep_version after insert or update on public.kb_articles
  for each row execute function private.kb_article_keep_version();

alter table public.kb_articles enable row level security;
alter table public.kb_article_versions enable row level security;

grant select, insert, update on public.kb_articles to authenticated;
grant select on public.kb_article_versions to authenticated;
grant all on public.kb_articles, public.kb_article_versions to service_role;

create policy kb_articles_select on public.kb_articles for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_staff()));
create policy kb_articles_insert on public.kb_articles for insert to authenticated
  with check (company_id = (select private.current_company_id()) and (select private.can_edit_ops()));
create policy kb_articles_update on public.kb_articles for update to authenticated
  using (company_id = (select private.current_company_id()) and (select private.can_edit_ops()))
  with check (company_id = (select private.current_company_id()) and (select private.can_edit_ops()));
create policy kb_article_versions_select on public.kb_article_versions for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_staff()));

-- Articles that match any of the words in a question, best first. Runs as the
-- caller, so it only finds what that person may read.
create or replace function public.kb_search(p_query text, p_shelves public.kb_shelf[] default null, p_limit integer default 6)
returns table (id uuid, shelf public.kb_shelf, section text, title text, body text, rank real)
language plpgsql stable security invoker set search_path = '' as $$
declare
  q tsquery;
begin
  q := nullif(replace(plainto_tsquery('english', left(coalesce(p_query, ''), 2000))::text, ' & ', ' | '), '')::tsquery;
  if q is null then
    return;
  end if;
  return query
    select a.id, a.shelf, a.section, a.title, a.body, ts_rank(a.search, q) as rank
    from public.kb_articles a
    where a.status = 'published'
      and (p_shelves is null or a.shelf = any (p_shelves))
      and a.search @@ q
    order by rank desc, a.position
    limit least(greatest(coalesce(p_limit, 6), 1), 20);
end;
$$;
revoke all on function public.kb_search(text, public.kb_shelf[], integer) from public, anon;
grant execute on function public.kb_search(text, public.kb_shelf[], integer) to authenticated, service_role;
