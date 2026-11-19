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

Two rules for every policy, learned in Wave A:

- Postgres ORs the `WITH CHECK` clauses of all update policies on a table. When
  a table has an office policy and a coordinator policy, the office policy's
  check must repeat its role test (`can_edit_ops()`), or a coordinator's update
  passes the office check and slips past their own limits.
- RLS cannot see which columns changed. Where coordinators may update a row,
  `private.limit_coordinator_update(cols...)` (a BEFORE UPDATE trigger) names
  the columns they may change.

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

`lib/mail/send.ts` is the only place a message leaves. It sends an approved
row of `agent_actions` through Gmail from an allowed mailbox
(`mail.send_from`, else the first of `mail.mailboxes`):

1. It refuses before touching the action when test mode is on with no test
   recipient, when no mailbox is allowed, or when no Workspace key is stored.
2. `action_send_begin()` (service role only) claims the action. It refuses a
   draft nobody approved, a sent one, one claimed in the last two minutes,
   and any action type the pause switch covers.
3. The portal link placeholder becomes a fresh link for the job contact in
   the To line. The token goes into the email only; the row keeps its hash.
4. The recipients pass the guard, the message goes out as plain text
   (`lib/mail/mime.ts`), and `action_send_finish()` records `sent` with the
   Gmail message id, who it went to and who it was meant for, or `failed`
   with the reason. A failed send can be tried again.

`mail.test_mode` and `mail.test_recipient` are not editable in the app.

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

## Booking and planning (Wave A)

A held date is a job in status `held` with its photo day and a `date_holds`
row, so the portal is one link per job from the first offer. Signing the
agreement confirms the hold (job to `planning`); a lapsed hold moves the job to
`released`, which frees its stations in `date_capacity`.

| Area | Tables and views |
| --- | --- |
| Season board | `season_offers` (one per league per season), `leads`, `touchpoints` |
| Holds and capacity | `date_holds`, `photo_days.stations`, view `date_capacity` |
| Agreement | `agreement_versions` (signed versions cannot change), `agreement_signatures` (permanent; written only by the signing function) |
| Planning | `planning_forms`, `teams`, `roster_files`, `roster_versions`, `schedules`, `schedule_slots` |
| Portal | `portal_links` (token hash only, office-only), `job_messages` |
| Readiness | view `photo_day_readiness`, computed from the records, never typed |
| Agent intake | `agent_events`, written by triggers on portal actions; staff read |

Coordinators may write only: planning form answers, roster uploads (25 MB
each), their own teams, schedule slots, and schedule status up to `started`.
`public.submit_schedule()` submits only when `public.schedule_problems()` finds
no missing team, overlap or out-of-range station.

## Date changes (Wave A)

Moving, postponing or cancelling a photo day is one action for an owner or
admin: `change_photo_day()`. A trigger refuses a signed-in edit of
`photo_days.date` or `photo_days.status` any other way, so no step is skipped.
The function:

- keeps the first date in `original_date` and records a row in `date_changes`
  (kind, from, to, reason, who);
- sets `photo_days.status` (`scheduled`, `postponed`, `cancelled`). Only
  scheduled days take stations in `date_capacity` or get chased. A reschedule
  onto a full date is refused unless the override is ticked. A job whose
  photo days are all cancelled becomes `cancelled`;
- restarts the chase: old `clock_log` steps keep their rows under a retired
  key, and chase drafts still waiting for the old date are withdrawn;
- queues a `dates.notify` draft to the coordinator (`lib/jobs/date-change.ts`)
  for approval, logs a line on the league timeline, and adds tasks to update
  Captura and the calendar by hand.

Crew shifts, kits, parent notices and the prepay close date join the cascade
when those modules exist.

## Coordinator portal

League coordinators never sign up or keep a password. The office makes a
portal link for one of the job's contacts on the job page (shown once; only
the SHA-256 of the token is stored in `portal_links`). Opening `/p/<token>`:

1. `portal_link_lookup()` (service role only) finds the live link and its
   contact. It refuses outright if the email belongs to staff.
2. The server creates an auth user for that email if none exists.
3. `portal_admit()` (service role only) gives the person the `coordinator`
   role and links them to the job in `job_coordinators`.
4. The server mints a normal Supabase session (admin `generateLink`, then
   `verifyOtp` with the hashed token), so RLS treats them like any user.

Links are reusable until they expire (60 days after the last photo day, at
least 60 days from creation) or the office revokes them.

`sign_agreement()` is the only way to write a signature. It checks the
coordinator, the active version, every required initial and a typed name,
then confirms the hold (hold row, job `held` to `planning`, season offer) and
logs a touchpoint. The PDF is built with pdf-lib from the stored records and
filed in the private `agreements` bucket; downloads go through
`/portal/<job>/agreement/pdf`, which checks RLS before handing out a
five-minute signed URL. Admins edit the agreement in Settings > Agreement;
a signed version never changes, so edits always become a new version.

## The daily clock and the approval queue (Wave A)

- `public.clock_due(company, today)` is the only place that decides what is
  due. It runs from the server (service role) and refuses a signed-in caller.
  It releases lapsed holds, returns the hold reminders due, and returns each
  confirmed job's chase step counted back from its first photo day (8, 5, 4
  and 3 weeks; all settings). A step whose day passed is logged as skipped,
  never sent late. A job with nothing missing gets no chase.
  Jobs imported from Notion (`jobs.notion_page_id` set) stay out of the chase
  until the company's `chase.include_imported` setting is true, because their
  planning lives in Notion until cutover.
- `lib/clock/run.ts` turns each item into a drafted row in `agent_actions`
  (status `proposed`) and logs it in `clock_log`, whose unique key makes each
  step happen once per job, or once per hold window. It sends nothing.
- `/api/cron/daily` (Vercel Cron, `vercel.json`) calls it once a day. The
  route refuses every call unless `CRON_SECRET` is set in Vercel, and skips
  any company whose `clock.enabled` setting is not true. An owner or admin can
  run their company by hand from the queue.
- `public.decide_action` records approve, edit or reject and keeps each action
  type's clean streak. A date-at-risk note is decided by an owner or admin.
- Drafts are templates (`lib/clock/drafts.ts`). The portal link is a
  placeholder filled at send time, so no live token is stored in a draft.
- Approving sends (see Mail). If the send cannot happen, the approval stands
  and the queue offers "Send now".

## Planning form, rosters and the scheduler (Wave A)

The three portal steps after signing. Each page reads as the signed-in person
through `lib/portal/job.ts`, so RLS decides what a coordinator or the office
sees; the office uses the same pages ("View as staff").

- **Planning form** (`/portal/[jobId]/planning`). Answers are one JSON object
  on `planning_forms.answers`, shaped by `lib/planning/form.ts`.
  `save_planning_form()` makes the row on first save (coordinators have no
  insert policy) and marks it submitted on "Send".
- **Rosters** (`/portal/[jobId]/rosters`). Files can be 25 MB, so the browser
  uploads straight to the private `rosters` bucket through a one-time link the
  server makes after checking the person (`lib/rosters/files.ts`). The row in
  `roster_files` is then written as that person, with the size and type read
  back from storage. The bucket has no policies; downloads go through a
  five-minute link after an RLS read. A row's path must sit under its own
  company and job (check constraint).
- **Finished roster** (job page, office only). Rosters are normalized outside
  the platform by the office's roster process; nothing here guesses at a
  league's layout. The office uploads the finished SNAP roster CSV, and
  `lib/rosters/standard.ts` checks it against that one format (exact header,
  reference numbers, Group equals Custom Data 3, Player or Coach, extra
  player rows) and refuses it with the failing lines otherwise.
  `import_standard_roster()` then fills `teams` (matched on
  `teams.roster_group`, the roster's Group value), removes teams an earlier
  roster brought that are gone and not on a schedule, and records a `ready`
  row in `roster_versions` with the file's path. Player names stay in the
  file; tables hold team facts and counts only. `/jobs/[id]/roster` hands
  staff the current file for the Captura upload step.
- **Scheduler** (`/portal/[jobId]/schedule`). Teams, then slots per station
  for each photo day. `open_schedule()` makes the schedule on a coordinator's
  first visit. "Place the remaining teams" (`lib/schedule/layout.ts`) fills
  the next open times and never moves a placed slot. Submit is blocked until
  `schedule_problems()` is empty. A coordinator's change after submitting, or
  any new team, sends the schedule back to started; the office marks a
  submitted schedule complete with `set_schedule_status()`.
- **Dates.** Coordinators are asked for the roster and schedule
  `chase.weeks_due` weeks before photo day (3) and told the last day is
  `chase.deadline_days` before it (10), matching the agreement. The portal
  reads both through `planning_due()`.

Not built yet: reading a roster into teams (the roster worker), drag to swap,
a print layout, and automatic TC numbers.

## Ask SNAP

`/ask` lets office and support staff ask a question about the business.

- `lib/ask/run.ts` calls the Claude API (key in `ANTHROPIC_API_KEY`, Vercel
  only). The model is the `agent.model` setting and must have a price in
  `lib/ask/pricing.ts`, or the question is refused.
- The model can only call the lookups in `lib/ask/tools.ts`. Each one is a
  read through the asker's own Supabase client, so RLS decides what it sees.
  There are no write tools. Text in records is treated as data.
- Every question is one row in `agent_runs`. `ask_snap_begin()` opens it and
  enforces the cap before anything is sent: `agent.daily_budget_usd` (editable
  in Settings, 0 turns Ask SNAP off) and `agent.monthly_budget_usd` when set.
  `ask_snap_finish()` records tokens and cost. Owner and admin see the last
  30 questions on `/ask` (RLS on `agent_runs`). A question also stops when it
  uses up what is left of the day, or after six model calls.
- A new company has no `agent.daily_budget_usd` row, so Ask SNAP is off until
  an admin saves a cap in Settings.
