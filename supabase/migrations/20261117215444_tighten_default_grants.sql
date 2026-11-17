-- =============================================================================
-- Tighten the grants Supabase adds by default. New tables in `public` come
-- with TRUNCATE, TRIGGER and REFERENCES for anon and authenticated. TRUNCATE
-- skips row-level security, so a signed-in person could empty a table. Remove
-- them, give anon nothing, and stop the defaults applying to future tables.
-- =============================================================================

revoke all on all tables in schema public from anon;
revoke truncate, trigger, references on all tables in schema public from authenticated;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke truncate, trigger, references on tables from authenticated;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- Helpers that read no table data do not need to be callable from outside.
revoke execute on function private.never_action_keys() from public;
