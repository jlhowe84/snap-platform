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

## Calendar

`/calendar` is one month grid (`lib/calendar.ts`): scheduled photo days, held
dates, the day each hold releases, and open tasks by due date, with photo
stations in use per day against `capacity.stations_per_date`. Views: everything,
my tasks only, photo days only. It reads as the signed-in person. Makeup
sessions and crew shifts join it with their modules.

## Playbook steps editor

`/settings/steps` (owner and admin) edits `playbook_steps`: name, stage, who
does it, days before or after the first photo day, notes, the `captura` tag
and whether the step is in use. Steps are reordered by renumbering the list
and switched off so tasks keep their `playbook_step_id`. A step can be removed
only while no task links to it (`removeStep` counts first; two clicks).
Helpers are in `lib/playbooks/steps.ts`. Steps edited here that came from
Notion would be overwritten by a Notion re-import (`private.import_notion`
upserts by `notion_page_id`), so do not re-import templates after cutover of
this list.

## Captura setup list

The job page lists the planning playbook's steps tagged `captura` as
checkboxes (`lib/captura/setup.ts`). Ticking one writes a task on the job
linked to the step, so it also shows on the task list. Beside the steps are
the values the office pastes into Captura: the coupon code (`jobs.coupon`),
the four marketing fields, and the welcome message, filled from the
`captura.welcome_templates` setting (keys `default` and one per sport, with a
`{{coupon}}` slot). Nothing here calls Captura. A Notion re-import rewrites
step tags, so re-tag the steps after one.

## Notices

`/notices` is each person's own list. A notice is one row in `notices`,
written only by triggers through `private.notify()`, which skips the person
who did the thing, inactive people and any kind they turned off
(`notice_mutes`). Three kinds exist: a task someone else assigned you, a
photo day change (owner, admin, office) and a date-at-risk note waiting
(owner, admin). A person can only mark their own notices read. Delivery is
in-app only for now.

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

Ask SNAP is also a pop-up in the corner of every staff page
(`app/(app)/ask-widget.tsx`, mounted in the app layout for the same roles).
It reuses the `/ask` box and server action, so roles, the daily cap and the
question log are the same. The conversation is kept in the layout, so it
stays while the person moves between pages and is gone on a full reload.

## Support desk (Wave B)

Module 12, the replacement for Hiver. Built so far: the data model, reading
mail in, the pages to work a conversation, replying and saved replies.

- `support_conversations`: one row per Gmail thread in a mailbox listed in
  `mail.mailboxes` (unique on company, mailbox and thread id). Holds the
  subject, the customer, status (`new`, `open`, `waiting_customer`,
  `waiting_lab`, `closed`), category, assignee, and an optional league and job.
- `support_messages`: each mail in (`in`) or out (`out`), plus internal notes
  (`note`). Text only, no attachments yet.
- `support_saved_replies`: reusable answers. Switched off with `active`, never
  removed, so no delete is granted.
- `support_sync_state`: where the mail sync left off per mailbox. Server only.

Conversations hold parents' names and addresses, so every policy is staff only
(`private.is_staff()`: owner, admin, office, support). Coordinators and crew
see nothing.

- People may change only the assignee, status, category, league and job of a
  conversation (`private.guard_support_conversation()`). Mail fields and
  timestamps are written by the server sync alone.
- People may add only notes, in their own name. Mail rows come from the sync
  and from the send path.
- `private.support_message_added()` keeps the conversation's times current,
  stamps the first response, reopens a closed or waiting conversation when the
  customer writes again, and moves `new` to `open` on the first reply.
- Conversations and messages are not copied into the change log, so customer
  text stays in one place. Saved replies are logged.

Mail comes in through `lib/support/sync.ts`, a server job. It reads each
mailbox in `mail.mailboxes` a day at a time, oldest first, and hands every
thread to `public.support_ingest()` (service role only), which stores the
thread and only the messages it does not have yet. It is read only: nothing is
sent, labelled, marked read or moved in Gmail.

- `lib/support/parse.ts` turns a Gmail thread into rows: plain text (HTML is
  reduced to text, never rendered), drafts, spam and trash dropped, and mail
  from the company's own addresses (`mail.mailboxes` plus
  `support.own_addresses`) marked `out`.
- Mail from an address in `support.quiet_senders` (automatic notices such as
  an order receipt) is left out, so its thread appears only once a person
  answers. Each run also clears untouched conversations made only of such
  mail (`public.support_drop_quiet()`), which covers ones stored before the
  sender was listed.
- `support.quiet_rules` does the same for an address that also writes real
  mail: an array of `{ from, subject }`, where the mail is left out only when
  its subject holds that text (`public.support_drop_quiet_rules()` clears the
  ones already stored).
- A thread with no mail from outside is not a conversation, so the platform's
  own sends stay out of the queue until someone answers them.
- The sender is matched to a league when their address belongs to a contact
  of exactly one league.
- The first run goes back `support.first_sync_days` (7 when not set). Each
  finished day is recorded in `support_sync_state`, so a run that stops early
  is picked up by the next one.
- Two ways to run it: "Check for new mail" on `/support` (any support desk
  role, their own company), and `/api/cron/support-sync` every ten minutes,
  which needs `CRON_SECRET` and only touches companies whose
  `support.sync_enabled` setting is true.

`/support` lists conversations (needs a reply, mine, unassigned, waiting,
closed) and `/support/[id]` shows one with its mail and notes, and lets staff
set who has it, where it stands and what it is about. Optional suggestions for
"about" come from the `support.categories` setting.

Replies leave through `lib/mail/reply.ts`, the second place (with
`lib/mail/send.ts`) that may call Gmail's send. The recipient is the
conversation's customer address and passes `lib/mail/guard.ts` like every send.

- Live: the reply goes out from the conversation's own mailbox inside the same
  Gmail thread, with `In-Reply-To` set to the last mail from the customer, and
  is stored as an `out` message in the sender's name. The next mail sync meets
  the same Gmail id and skips it. The sender picks what the conversation
  becomes (waiting on customer by default).
- Test mode: the reply goes only to the test recipient, outside the customer's
  thread, and is stored as a staff note that says so. Reply times and status
  are left alone, because the customer got nothing.

Saved replies are managed at `/support/replies` by anyone on the support desk
and dropped into the reply box from a picker. `{first_name}` and `{my_name}`
are filled in when one is inserted (`lib/support/saved.ts`).

A website form is sent from the site's address with the person's address as
Reply-To. `parseThread` reads the Reply-To person as the writer (unless it is
one of our own addresses), so the conversation's customer and the address a
reply goes to are the person's. Reading a thread again corrects an inbound
message's writer and text and, when the opening message now names someone
else, the conversation's customer (`support_ingest`).

### Drafted replies

"Draft a reply" on a conversation asks the model for a suggested answer and
puts it in the reply box (`lib/support/draft.ts`, prompts in
`lib/support/draft-prompt.ts`). It never sends and stores nothing on the
conversation. It runs as the signed-in person, so RLS decides what it can
read, and it is shown only the conversation, the matched league's name and the
active saved replies. It is told to leave a note in [brackets] for any fact it
does not have, and never to promise a refund, a reprint or a date. It spends
from the Ask SNAP daily cap through `ask_snap_begin` and `ask_snap_finish`;
the run is logged with a fixed label and without the customer's words or the
draft.

When Captura is connected the draft may make up to three rounds of read-only
lookups (`lib/support/draft-tools.ts`): one order by the number the customer
gave, galleries by title, and a player in one gallery by name (access code and
personal link). `lib/captura/shape.ts` passes on only what a reply needs: no
addresses, phone numbers, fee lines or image counts. Each result says whether
the email on the order or player matches the customer's; when it does not, the
draft carries a [bracketed note] asking staff to confirm. The reply box lists
what was looked up. Captura has no search by email, so an order is only found
by its number.

A reply that still holds a [bracketed note] or an unfilled {blank} is not
sent: the Send button is off and `sendReply` refuses it on the server
(`unfilledNotes` in `lib/support/saved.ts`).

## Lab invoices (Wave B)

The lab emails one invoice per order as a PDF. The platform keeps a record of
each so lab costs add up by job, season and year, and any invoice can be found
again.

- **Pickup** (`lib/lab/sync.ts`, run by hand from Lab costs or by
  `/api/cron/lab-invoices` when `lab.invoices_enabled` is true). It searches
  the allowed mailboxes for the senders and subject words in
  `lab.invoice_sources`, reads each PDF attachment, files the PDF in Drive and
  stores the invoice. It only reads Gmail. Messages already stored or skipped
  are not opened again, so a run that stops early is picked up by the next.
- **Reading** (`lib/lab/invoice-parse.ts`, `lib/lab/pdf-text.ts`). By rule
  from the PDF's own text, with no model. One invoice can hold several
  orders, each with its own PO number, job name and customer, and can run
  onto further pages; a remake order has no customer line. The lab's "PO No"
  is the Captura order number; its "Online Order No" is not. The ship-to
  address is never read. Each order gets its own lines plus a share of the
  invoice's tax (`orderCosts`, in cents, adding up to the invoice). An invoice
  whose lines do not add up is stored with `needs_check`.
- **Drive** (`lib/drive/client.ts`). The Workspace service account signs in
  as itself (no delegation), so it sees only what is shared with its own
  address: the one folder in `lab.invoice_drive_folder`. The client finds or
  makes a month folder (`2026-11`, by invoice date) and adds the PDF. It never
  deletes, moves or shares.
- **Captura** (`enrichOrders` in `lib/lab/sync.ts`, read only). Each order's
  PO number is looked up, a few dozen a run: its gallery id, and its money
  (`orderMoney`: total, tax, shipping, Captura's fees, net pay, pay date).
  An order Captura does not know is tried again after a week. Profit is net
  pay less what the lab charged for that order. A PO the lab invoiced twice
  (a remake) counts its net pay once and every lab charge.
- **Jobs** (`lab_invoices_link`). An order's gallery ties it to the job whose
  `job_links.captura_gallery_id` matches, and what one order of a lab job
  name knows holds for that name's other orders. The office can also match a
  lab job name to a job by hand (`lab_assign_reference`); later orders follow.
- **Tables**: `lab_invoices`, `lab_invoice_orders`, `lab_invoice_items`, `lab_invoice_skips`
  (emails that could not be read), `lab_invoice_sync_state`. Office only
  (owner, admin, office); the server is the only writer.
  `lab_cost_summary()` adds costs, net pay and profit up as the person asking.

## Knowledge base (Wave B)

`kb_articles` holds one article per question or topic on one of three shelves:
`answers` (what parents ask, in approved wording; the parent help center will
read this shelf), `support` (voice, handling rules, reply templates, company
facts, open policy questions) and `handbook` (staff procedures). Status is
`published`, `draft` or `retired`; nothing is deleted.

- Staff (owner, admin, office, support) read; owner, admin and office write.
  A before trigger stamps `created_by`, `updated_by` and the version number, and
  keeps `company_id` fixed. An after trigger (security definer) copies every
  new version into `kb_article_versions`, which people can read but not write.
  Reordering (`position`) is not a new version.
- `search` is a generated, weighted tsvector (title, section, body).
  `kb_search(query, shelves, limit)` runs as the caller and matches any word
  of a question, so a support draft finds articles from the customer's words.
- Pages: `/knowledge` (shelves, sections, search across shelves),
  `/knowledge/[id]` (the article, editing, earlier versions), `/knowledge/new`,
  `/knowledge/import`.
- Import (`lib/kb/import.ts`) reads the customer service document's Markdown by
  rule: `##` sections, `###` questions to the answers shelf, whole-line bold
  names (templates) and plain sections to the support shelf. Front matter and
  anything before the first `##` is left out; an article already present with
  the same shelf, section and title is skipped.
- Articles are written in light Markdown and shown through `lib/kb/blocks.ts`
  and `components/kb-text.tsx`, which build elements from plain data, so no
  HTML in an article reaches the page. Links are web or mail addresses only.
- Support drafts (`lib/support/draft.ts`) add up to six matching published
  articles from the answers and support shelves to the prompt.

## Staffing (Wave B, module 7)

Replaces StaffMate: shift picking, pay rates, pay per shift with mileage, the
payroll report, and the added or removed notices. Text messages and the
day-before briefing come with the field view and the clock.

- `shifts`: one row per position needed on a photo day (photographer, poser,
  coordinator, photo attendant), with an optional station and times. Status is
  `draft` (crew cannot see it), `open`, `filled` (always with a person) or
  `cancelled`. A trigger keeps `company_id` and `job_id` in step with the photo
  day and stamps `published_at` and `filled_at`. One shift per person per day.
- Waves: Level 1 is asked first. `open_level` is the highest Level that sees an
  open shift; the office widens it one Level at a time from `/staffing/[dayId]`
  until it is null (everyone, including crew with no Level). The clock will
  widen waves on a timer once Josh turns it on.
- Crew never read photo days or jobs directly. `crew_shift_board()` (security
  definer) returns their own coming shifts and the offers open to them, with
  the day's place and times; `respond_to_shift(id, accept)` locks the row,
  checks the offer is still theirs, refuses an overlapping shift the same day,
  and fills it or records the decline in `shift_responses`. Postponed and
  cancelled days are left out.
- `pay_rates`: per person and position, per shift or per hour. Owner and admin
  read and write; a crew member reads their own. Pay is kept out of the
  activity log, which all staff can read.
- A person given the crew role is linked to the crew record with the same
  email (`profile_roles` trigger), so their shifts find them.
- Pages: `/staffing` (coming photo days and how full they are),
  `/staffing/[dayId]` (add shifts from the station count, publish, widen,
  assign, take off, cancel), `/shifts` (the crew phone page), `/crew/[id]`
  (details, coming shifts, pay rates for owner and admin). Crew with no office
  role land on `/shifts` and see only it and their notices.
- `pay_lines`: one per filled shift worked (`create_pay_lines(from, to)`,
  owner and admin only), priced from the person's rate: the rate per shift, or
  per hour times the shift's length. Miles are entered by hand and paid at
  `pay.mileage_cents_per_mile` (0 until Josh sets it); a trigger works out the
  mileage, stamps who approved and when it was paid. Pending, approved, paid;
  a paid line cannot change or be removed. Crew read their own.
- `/crew/pay` (owner and admin): a date range that starts as the last
  `pay.period_days`, totals by person, each line's miles, hours and
  adjustment, approve and mark paid in bulk, and `/crew/pay/export` (CSV, cells
  that look like formulas are defused). Payroll is still run where it runs
  today, from this report.
- Notices: when the office puts someone on a shift, takes them off or cancels
  their shift, a `crew.notify` draft to that person goes into the approval
  queue (`lib/staffing/notices.ts`). It is sent like any other draft, so test
  mode applies.

## Gear and the field view (Wave B, module 8)

- `kits` (A to K at SNAP: ready, needs service, retired), `kit_checklist_items`
  (the master checklist, by section, some outdoor only), `camera_bodies`
  (serial, letter, model, optionally the kit it lives in) and `kit_checkouts`
  (a kit on a photo day, with its station: planned, out, back, and what came
  back missing or broken). Staff read; owner, admin and office write.
- A trigger fills the checkout's company and job from the photo day, refuses a
  kit on two photo days the same date, and stamps who sent it out and checked
  it in. A kit that comes back with anything missing or an issue is marked
  needs service. A checkout that went out cannot be deleted.
- `field_view(photo_day)` (security definer) returns one day as JSON for its
  booked crew and for staff: times, place and map, rain plan, notes, league
  contact, crew and roles, kits with their cameras, the schedule by station and
  the checklist (outdoor items left off for indoor days). Crew phone numbers
  are shown to staff only.
- Pages: `/gear` (kits, problems from recent returns, camera bodies, the master
  checklist), kits on `/staffing/[dayId]` (add by station, send out, check in
  against the checklist), and `/field/[dayId]` (phone first; prints as the day
  sheet). Crew open it from their shifts page. Offline caching and the
  evening-before push are not built yet.
- SNAP's 11 kits, the 29-line master checklist and 7 camera bodies were loaded
  from the SNAP OS gear files (February 2026, not re-verified); bodies are not
  put in kits until someone confirms which is which.

## Parent photo day page and help center (Wave B, module 13, part one)

- `day_pages` holds one public page per job: an unguessable slug (name words
  plus five random characters), a published flag, what to wear and bring, a
  note, and whether to show team times. Office staff make and publish it from
  the job page. Nothing is public until it is published.
- Visitors are not signed in. `/day/[slug]` reads `public.public_day_page()`
  and `/help/[company]` reads `public.public_help_articles()` and
  `public.public_company()`, all security definer and granted to `anon`. The
  tables stay closed to `anon`.
- The day page carries dates, times, place, day status, the shop link and
  coupon, and, once the schedule is submitted, team names, divisions and
  times. Never players, coaches, contacts, notes or rosters (a permission test
  checks this).
- The help center lists published answers-shelf articles with
  `kb_articles.on_help_center` set. Office staff turn each one on from the
  article page. An answer with a staff slot like `[GALLERY LINK]` cannot go on,
  and comes off if an edit adds one or moves it off the answers shelf.
- Both pages use the light `.outward` theme (`components/public-shell.tsx`).
- Part two (not built): gallery link and order lookups that send only to the
  email or phone on record, rate limited; makeup booking; chat; QR sign and
  flyer.

### Crew pay follow-ups (owner's answers, 2026-11-19)

- Level 1 is the top crew level; offers go to Level 1 first.
- Crew are paid by the hour, so a new pay rate defaults to hourly.
- Mileage is a company setting (`pay.mileage_cents_per_mile`), editable in
  Settings. It is paid round trip, from the person's home to the photo day and back. Home
  addresses live in `crew_homes`, owner and admin only, never in the activity
  log. The pay page links driving directions from home to the day; working
  out the miles automatically needs a maps service and is not built yet.
- Each kit keeps its camera body (`camera_bodies.kit_id`), set on the Gear page.

### Crew profiles and direct assignment (owner's ask, 2026-11-20)

- `/crew/[id]` is the crew member's profile: photo, contact details,
  positions, Level, notes (office edits), home address and emergency contact
  (`crew_private`, owner and admin only, never logged), pay rates (owner and
  admin). `/crew/new` adds someone.
- Photos live in the private `crew-photos` bucket; the server makes one-hour
  signed links for staff (`lib/staffing/photos.ts`).
- The office can put someone straight on a photo day from the job page or
  the staffing page (`assignDirect`): a filled shift in the office's name, with
  the crew notice queued for approval.
- Embedding `crew_members` from `shifts` must name the foreign key
  (`crew_members!shifts_crew_member_id_fkey`): `shift_responses` and
  `pay_lines` also link the two tables, so PostgREST finds more than one path.
