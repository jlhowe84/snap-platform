-- December counts toward the next year's Winter (Josh, 2026-11-18): one
-- winter season runs December through February, so Dec 2026, Jan 2027 and
-- Feb 2027 are all "Winter 2027". lib/season.ts mirrors this.
create or replace function public.season_label(p_date date)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_date is null then null
    when extract(month from p_date) = 12 then 'Winter ' || (extract(year from p_date)::int + 1)
    when extract(month from p_date) in (1, 2) then 'Winter ' || extract(year from p_date)::int
    when extract(month from p_date) between 3 and 5 then 'Spring ' || extract(year from p_date)::int
    when extract(month from p_date) between 6 and 8 then 'Summer ' || extract(year from p_date)::int
    else 'Fall ' || extract(year from p_date)::int
  end
$$;
