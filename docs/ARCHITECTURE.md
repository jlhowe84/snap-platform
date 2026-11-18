# Architecture (Phase 0)

## Stack

Next.js 16 (App Router) on Vercel, Supabase Postgres (project `snap-platform`,
us-east-1), Supabase Auth with Google sign-in, Tailwind v4.

## Tenancy and access

Every business table carries `company_id`. A person's profile belongs to one
company and holds one or more roles in `profile_roles`:

| Role | Sees |
| --- | --- |
| owner | everything, and is the only role that can grant owner or admin |
| admin | everything; invites staff; changes settings |
| office | leagues, jobs, crew, tasks |
| support | leagues and jobs, for answering customers |
| crew | jobs and their own assignments |
| coordinator | only the jobs they are linked to (portal, Phase 1+) |

Access starts with a row in `staff_invites`. When a person first signs in, a
trigger on `auth.users` creates the profile and applies a matching invite. A
person with no invite signs in to a "waiting for access" page and sees no
data. The RLS policies use helpers in the `private` schema
(`current_company_id()`, `has_role()`, `is_staff()`), which the Data API never
exposes. `supabase/tests/permissions.sql` checks the full read matrix and the
write rules for every role; run it with `npm run test:db`.

Hardening on top of Supabase defaults: anon has no table, sequence or function
grants; TRUNCATE, TRIGGER and REFERENCES are revoked from authenticated (they
bypass RLS).

## Action layer

Every change the app or the agent makes is a registered action type
(`action_types`, `lib/actions/define.ts`) with a kind:

- **read**: no side effects.
- **draft**: writes something only a person can send.
- **propose**: a person approves first, until the action earns autonomy
  through a clean streak of approvals with no edits.
- **never**: can be flagged for a person, never executed by the agent.

The never list is enforced in Postgres: those keys cannot be moved off the
list, earn autonomy, be deleted, proposed or executed. `agent_pauses` is the
pause switch; `agent_actions` records every proposal and run;
`activity_log` is append-only and written by triggers.

## Mail

`lib/mail/guard.ts` rewrites every recipient to `mail.test_recipient` while
`mail.test_mode` is true. Both are company settings, not code.

## Integrations

Credentials are stored in Supabase Vault, mapped per company in
`private.integration_secrets`, and read only by the service role through
`public.integration_secret()`. Status for the settings screen is in
`integration_status`. The Captura client is read-only by construction.

## Notion import

`private.notion_staging` holds raw rows; `private.import_notion(company)` loads
them into organizations, contacts, crew, playbooks and jobs with photo days.
It is idempotent (matched on `notion_page_id`). The loader that fills staging
converts Notion's UTC datetimes to the company time zone first, as
`YYYY-MM-DD HH24:MI:SS`, because `import_notion` reads the local date and time
from that text.

## Seasons

Season is never stored. It is derived from a job's earliest photo day by
`public.season_label()` and mirrored in `lib/season.ts`: December, January and
February are one Winter, labeled by the January year (December 2026 is Winter
2027).
