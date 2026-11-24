-- =============================================================================
-- Team card (TC) numbers number themselves.
--
-- Every team on a job gets the next whole number when it is added, starting
-- at 1, whoever adds it (the roster import, the office or a coordinator). A
-- number is permanent: removing a team does not renumber the rest, and the
-- office can still type a different value on a team. Teams that already
-- exist without a number are numbered here, by division then name.
-- =============================================================================

create or replace function private.assign_team_card_number()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_next int;
begin
  if new.tc_number is null or btrim(new.tc_number) = '' then
    -- One numbering at a time per job, so two people adding teams at once
    -- cannot be handed the same number.
    perform pg_advisory_xact_lock(hashtextextended(new.job_id::text, 4207));
    select coalesce(max(t.tc_number::int), 0) + 1 into v_next
      from public.teams t
     where t.job_id = new.job_id and t.tc_number ~ '^[0-9]{1,6}$';
    new.tc_number := v_next::text;
  end if;
  return new;
end;
$$;
revoke all on function private.assign_team_card_number() from public;

create trigger teams_card_number before insert on public.teams
  for each row execute function private.assign_team_card_number();

with base as (
  select job_id, coalesce(max(tc_number::int) filter (where tc_number ~ '^[0-9]{1,6}$'), 0) as top
    from public.teams group by job_id
), numbered as (
  select t.id, b.top + row_number() over (partition by t.job_id order by t.division nulls last, t.name, t.created_at, t.id) as n
    from public.teams t join base b on b.job_id = t.job_id
   where t.tc_number is null or btrim(t.tc_number) = ''
)
update public.teams t set tc_number = numbered.n::text from numbered where numbered.id = t.id;
