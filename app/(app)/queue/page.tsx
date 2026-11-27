import Link from "next/link";
import { requireStaff, hasAnyRole, ADMIN_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import { DRAFT_LABEL, isDraftKind } from "@/lib/clock/drafts";
import { DATE_NOTICE_KEY, DATE_NOTICE_LABEL } from "@/lib/jobs/date-change";
import { CREW_NOTICE_KEY, CREW_NOTICE_LABEL } from "@/lib/staffing/notices";
import { MAKEUP_OFFER_KEY, MAKEUP_OFFER_LABEL } from "@/lib/production/makeup-offer";
import { DELIVERY_LABEL_BY_KEY } from "@/lib/delivery/drafts";
import { approveAll } from "./actions";
import { DraftForm, RunClockButton, SendButton } from "./forms";
import { SubmitButton } from "@/components/submit-button";

type Draft = { to?: unknown; subject?: unknown; body?: unknown };
type Refs = { job_id?: string | null; org_id?: string | null };

const label = (key: string) =>
  isDraftKind(key) ? DRAFT_LABEL[key] : key === DATE_NOTICE_KEY ? DATE_NOTICE_LABEL : key === CREW_NOTICE_KEY ? CREW_NOTICE_LABEL : key === MAKEUP_OFFER_KEY ? MAKEUP_OFFER_LABEL : (DELIVERY_LABEL_BY_KEY[key] ?? key);
// A moment in time (drafted, decided), shown on the company's clock so an
// evening draft does not read as tomorrow's.
const whenIn = (timeZone: string) => (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

const STATUS_LABEL: Record<string, string> = {
  approved: "Approved, not sent",
  edited: "Approved with changes, not sent",
  rejected: "Rejected",
  sent: "Sent",
  failed: "Could not send",
};

function sentTo(result: unknown) {
  const r = (result ?? {}) as { sent_to?: unknown; test_mode?: unknown };
  const to = Array.isArray(r.sent_to) ? r.sent_to.filter((x): x is string => typeof x === "string").join(", ") : "";
  return r.test_mode ? `Went to the test address${to ? ` (${to})` : ""}` : `Went to ${to}`;
}

export default async function QueuePage() {
  const viewer = await requireStaff(["owner", "admin", "office", "support"]);
  const admin = hasAnyRole(viewer, ADMIN_ROLES);
  const when = whenIn(viewer.timeZone);
  const supabase = await createClient();

  const [{ data: waiting }, { data: decided }, { data: settings }] = await Promise.all([
    supabase
      .from("agent_actions")
      .select("id, action_type_key, draft, record_refs, created_at")
      .eq("status", "proposed")
      .order("created_at", { ascending: true })
      .limit(100),
    supabase
      .from("agent_actions")
      .select("id, action_type_key, status, draft, result, error, decided_at, decision_note, profiles!agent_actions_decided_by_fkey(full_name)")
      .in("status", ["approved", "edited", "rejected", "sent", "failed"])
      .order("decided_at", { ascending: false })
      .limit(15),
    supabase.from("settings").select("key, value").in("key", ["clock.enabled", "mail.test_mode", "mail.test_recipient"]),
  ]);

  const list = waiting ?? [];
  const jobIds = [...new Set(list.map((a) => (a.record_refs as Refs | null)?.job_id).filter((x): x is string => !!x))];
  const orgIds = [...new Set(list.map((a) => (a.record_refs as Refs | null)?.org_id).filter((x): x is string => !!x))];
  const [{ data: jobs }, { data: orgs }] = await Promise.all([
    jobIds.length ? supabase.from("jobs").select("id, name").in("id", jobIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    orgIds.length ? supabase.from("organizations").select("id, name").in("id", orgIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const jobName = new Map((jobs ?? []).map((j) => [j.id, j.name]));
  const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]));

  // One line per draft, gathered under its job (or league) so a job's
  // messages are read together. Groups keep the order of their oldest draft.
  const grouped = new Map<string, { a: (typeof list)[number]; draft: Draft; refs: Refs; to: string[] }[]>();
  for (const a of list) {
    const draft = (a.draft ?? {}) as Draft;
    const refs = (a.record_refs ?? {}) as Refs;
    const to = Array.isArray(draft.to) ? draft.to.filter((x): x is string => typeof x === "string") : [];
    const key = refs.job_id ?? refs.org_id ?? "none";
    grouped.set(key, [...(grouped.get(key) ?? []), { a, draft, refs, to }]);
  }
  const groups = [...grouped];

  const counts = new Map<string, number>();
  for (const a of list) counts.set(a.action_type_key, (counts.get(a.action_type_key) ?? 0) + 1);
  const clockOn = settings?.find((s) => s.key === "clock.enabled")?.value === true;
  const testMode = settings?.find((s) => s.key === "mail.test_mode")?.value !== false;
  const testTo = settings?.find((s) => s.key === "mail.test_recipient")?.value;
  const hasTestTo = typeof testTo === "string" && testTo.includes("@");

  return (
    <>
      <PageHeader eyebrow="Customers · Approval queue" title={list.length ? `${list.length} waiting` : "All clear"}>
        {admin && <RunClockButton />}
      </PageHeader>
      <p className="mb-6 max-w-2xl text-sm text-muted">
        Drafts wait here until a person approves them. Tap a line to read or change it. Approving saves the final wording and sends the message.
        {testMode
          ? hasTestTo
            ? " Test mode is on: every message goes to the test address only, never to the league."
            : " Test mode is on and no test address is set yet, so approved drafts wait here unsent."
          : " Messages go to the addresses on the draft."}
        {!clockOn && " The daily check is off, so drafts appear only when an owner or admin checks what is due."}
      </p>

      {counts.size > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {[...counts].map(([key, n]) => (
            <form key={key} action={approveAll.bind(null, key)}>
              <SubmitButton
                disabled={key === "chase.at_risk" && !admin}
                className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50"
              >
                Approve as written: {label(key)} ({n})
              </SubmitButton>
            </form>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-5 xl:col-span-2">
          {list.length === 0 && <Empty>Nothing is waiting for approval.</Empty>}
          {groups.map(([groupKey, items]) => (
            <section key={groupKey}>
              <h2 className="mb-2 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
                {items[0].refs.job_id ? (
                  <Link href={`/jobs/${items[0].refs.job_id}`} className="hover:text-accent">
                    {jobName.get(items[0].refs.job_id) ?? "Job"}
                  </Link>
                ) : items[0].refs.org_id ? (
                  <Link href={`/leagues/${items[0].refs.org_id}`} className="hover:text-accent">
                    {orgName.get(items[0].refs.org_id) ?? "League"}
                  </Link>
                ) : (
                  "Not tied to a job"
                )}
                {items[0].refs.job_id && items[0].refs.org_id && (
                  <Link href={`/leagues/${items[0].refs.org_id}`} className="font-normal text-muted hover:text-accent">
                    {orgName.get(items[0].refs.org_id) ?? "League"}
                  </Link>
                )}
              </h2>
              <div className="overflow-hidden rounded-xl border border-line bg-surface">
                {items.map(({ a, draft, to }) => (
                  <details key={a.id} className="group border-b border-line last:border-b-0">
                    <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-sm hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                      <Pill tone={a.action_type_key === "chase.at_risk" ? "risk" : "accent"}>{label(a.action_type_key)}</Pill>
                      <span className="min-w-0 flex-1 basis-48 truncate">
                        {typeof draft.subject === "string" && draft.subject ? draft.subject : "No subject"}
                      </span>
                      <span className="text-xs text-muted">
                        {to.length ? `to ${to[0]}${to.length > 1 ? ` and ${to.length - 1} more` : ""} · ` : ""}
                        {when(a.created_at)}
                      </span>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-muted group-open:rotate-180">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </summary>
                    <div className="border-t border-line p-4">
                      <DraftForm
                        id={a.id}
                        to={to}
                        subject={typeof draft.subject === "string" ? draft.subject : ""}
                        body={typeof draft.body === "string" ? draft.body : ""}
                        canDecide={a.action_type_key !== "chase.at_risk" || admin}
                      />
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        <Card title="Recently decided">
          {decided?.length ? (
            <ul className="space-y-3 text-sm">
              {decided.map((d) => {
                const who = (d.profiles as { full_name: string | null } | null)?.full_name ?? "Staff";
                const subject = (d.draft as Draft | null)?.subject;
                return (
                  <li key={d.id}>
                    <p className="flex flex-wrap items-center gap-2">
                      <Pill tone={d.status === "rejected" || d.status === "failed" ? "risk" : d.status === "sent" ? "ok" : "warn"}>
                        {STATUS_LABEL[d.status] ?? d.status}
                      </Pill>
                      <span className="text-muted">{label(d.action_type_key)}</span>
                    </p>
                    <p className="truncate">{typeof subject === "string" ? subject : ""}</p>
                    <p className="text-xs text-muted">
                      {who}
                      {d.decided_at ? `, ${when(d.decided_at)}` : ""}
                      {d.decision_note ? `: ${d.decision_note}` : ""}
                    </p>
                    {d.status === "sent" && <p className="text-xs text-muted">{sentTo(d.result)}</p>}
                    {d.status === "failed" && d.error && <p className="text-xs text-risk">{d.error}</p>}
                    {(d.status === "approved" || d.status === "edited" || d.status === "failed") && (
                      <SendButton id={d.id} retry={d.status === "failed"} />
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>No decisions yet.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
