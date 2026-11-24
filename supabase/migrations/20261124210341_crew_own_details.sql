-- =============================================================================
-- Crew keep their own details current.
--
-- A crew member may read and change their own phone, town, home address and
-- emergency contact, and nothing else: not their name, email, positions,
-- Level, notes or pay, and never anyone else's row. Two functions do it, both
-- keyed on the signed-in crew member, so the tables' own rules stay as they
-- are (home and emergency details remain owner and admin only to read).
--
-- A home address feeds mileage, so the row remembers when the crew member
-- last changed it themselves and the office can see that.
-- =============================================================================

alter table public.crew_private add column self_updated_at timestamptz;

create or replace function public.my_crew_details()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'full_name', c.full_name, 'email', c.email, 'phone', c.phone, 'city', c.city, 'state', c.state,
    'address', p.address, 'emergency_name', p.emergency_name, 'emergency_phone', p.emergency_phone)
  from public.crew_members c
  left join public.crew_private p on p.crew_member_id = c.id
  where c.id = private.my_crew_member_id()
$$;
revoke all on function public.my_crew_details() from public, anon;
grant execute on function public.my_crew_details() to authenticated;

create or replace function public.save_my_crew_details(
  p_phone text, p_city text, p_state text, p_address text, p_emergency_name text, p_emergency_phone text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_id      uuid := private.my_crew_member_id();
  v_company uuid;
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
  v_name    text := nullif(btrim(coalesce(p_emergency_name, '')), '');
  v_ephone  text := nullif(btrim(coalesce(p_emergency_phone, '')), '');
begin
  if v_id is null then
    raise exception 'only a crew member can change their own details' using errcode = '42501';
  end if;
  if length(coalesce(p_phone, '')) > 40 or length(coalesce(p_city, '')) > 80 or length(coalesce(p_state, '')) > 40
     or length(coalesce(v_name, '')) > 120 or length(coalesce(v_ephone, '')) > 40
     or (v_address is not null and length(v_address) not between 5 and 300) then
    raise exception 'one of the details is too long or the address is too short';
  end if;

  update public.crew_members set
    phone = nullif(btrim(coalesce(p_phone, '')), ''),
    city  = nullif(btrim(coalesce(p_city, '')), ''),
    state = nullif(btrim(coalesce(p_state, '')), '')
  where id = v_id
  returning company_id into v_company;

  insert into public.crew_private as cp (crew_member_id, company_id, address, emergency_name, emergency_phone, self_updated_at)
  values (v_id, v_company, v_address, v_name, v_ephone, now())
  on conflict (crew_member_id) do update set
    address = excluded.address,
    emergency_name = excluded.emergency_name,
    emergency_phone = excluded.emergency_phone,
    self_updated_at = case
      when (cp.address, cp.emergency_name, cp.emergency_phone) is distinct from (excluded.address, excluded.emergency_name, excluded.emergency_phone)
      then now() else cp.self_updated_at end;
end;
$$;
revoke all on function public.save_my_crew_details(text, text, text, text, text, text) from public, anon;
grant execute on function public.save_my_crew_details(text, text, text, text, text, text) to authenticated;
