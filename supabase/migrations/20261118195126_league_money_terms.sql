-- =============================================================================
-- League-specific money terms and two booking settings (Josh, 2026-11-18).
--
-- Sponsorships, rebates and parent discounts are agreed league by league, so
-- they stay out of the standard agreement text. They are recorded on the
-- league (organization_terms) and shown on each of that league's jobs. Staff
-- read them, the office edits them, coordinators never see them (the existing
-- organization_terms policies).
--
-- photo_day.min_players: the smallest photo day worth booking (50 to start; a
--   profitability-based number can replace it once orders sync).
-- agreement.facility_fee_cap_usd: the most SNAP covers of a facility rental fee.
-- =============================================================================

alter table public.organization_terms
  add column sponsorship      text check (char_length(sponsorship) <= 2000),
  add column rebate           text check (char_length(rebate) <= 2000),
  add column parent_discount  text check (char_length(parent_discount) <= 2000),
  add column other_terms      text check (char_length(other_terms) <= 4000),
  add column terms_updated_by uuid references public.profiles(id) on delete set null;
create index organization_terms_updated_by_idx on public.organization_terms (terms_updated_by);

create or replace function private.seed_booking_defaults(p_company uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.settings (company_id, key, value) values
    (p_company, 'photo_day.min_players',          '50'::jsonb),
    (p_company, 'agreement.facility_fee_cap_usd', '250'::jsonb)
  on conflict (company_id, key) do nothing
$$;
revoke all on function private.seed_booking_defaults(uuid) from public, authenticated;

do $$
declare c uuid;
begin
  for c in select id from public.companies loop
    perform private.seed_booking_defaults(c);
  end loop;
end $$;
