@AGENTS.md

# Photo Day Platform: working contract

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing anything. The
spec is the authority (SNAP OS repo, `snap-os/60-projects/photo-day-platform/`).

## Rules

- **Postgres RLS is the gate.** Every table has `company_id` and RLS policies
  that call helpers in the `private` schema. No table ships without policies
  and a row in `supabase/tests/permissions.sql` for every role.
- **Schema changes only through migrations** in `supabase/migrations/`. Run
  `npm run test:db` (needs a local Postgres, see the script) before applying
  to the hosted project, then regenerate `lib/database.types.ts`.
- **The never list lives in the database** (`private.never_action_keys()`).
  `lib/actions/never.ts` mirrors it and a test fails if they drift.
- **Mail goes through `lib/mail/guard.ts`.** While `mail.test_mode` is true
  (the whole prototype phase) every recipient is rewritten to the test
  recipient.
- **Captura is read-only** (`lib/captura/client.ts`). Never add the lab status
  PUT (`service-order`) or the unsubscribe endpoints.
- **No company data or secrets in code.** Names, prices, emails, account ids
  and policies are rows in the database. Secrets live in Supabase Vault or
  Vercel environment variables.
- The service-role client (`lib/supabase/admin.ts`) is for server jobs with no
  signed-in person. Requests on someone's behalf use `lib/supabase/server.ts`.
- Calendar dates (`photo_days.date`) are formatted in UTC; "today" comes from
  the company time zone (`lib/dates.ts`).

## Commands

- `npm run dev`, `npm run build`, `npm run lint`, `npm run typecheck`
- `npm test` (unit tests), `npm run test:db` (migrations plus permission tests)
