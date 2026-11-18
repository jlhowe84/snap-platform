import Link from "next/link";
import { requireStaff, hasAnyRole, ADMIN_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import { DRAFT_LABEL, isDraftKind } from "@/lib/clock/drafts";
import { approveAll } from "./actions";
import { DraftForm, RunClockButton } from "./forms";

type Draft = { to?: unknown; subject?: unknown; body?: unknown };
type Refs = { job_id?: string | null; org_id?: string | null };

const label = (key: string) => (isDraftKind(key) ? DRAFT_LABEL[key] : key);
const when = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(iso));

export default async function QueuePage() {
  const viewer = await requireStaff(["owner", "admin", "office", "support"]);
  const admin = hasAnyRole(viewer, ADMIN_ROLES);
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
      .select("id, action_type_key, status, draft, decided_at, decision_note, profiles!agent_actions_decided_by_fkey(full_name)")
      .in("status", ["approved", "edited", "rejected"])
      .order("decided_at", { ascending: false })
      .limit(15),
    supabase.from("settings").select("key, value").in("key", ["clock.enabled", "mail.test_mode"]),
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

  const counts = new Map<string, number>();
  for (const a of list) counts.set(a.action_type_key, (counts.get(a.action_type_key) ?? 0) + 1);
  const clockOn = settings?.find((s) => s.key === "clock.enabled")?.value === true;

  return (
    <>
      <PageHeader eyebrow="Approval queue" title={list.length ? `${list.length} waiting` : "All clear"}>
        {admin && <RunClockButton />}
      </PageHeader>
      <p className="mb-6 max-w-2xl text-sm text-muted">
        Drafts wait here until a person approves them. Approving saves the final wording. Nothing is emailed from the
        platform yet, and when sending arrives every message goes to the test address only.
        {!clockOn && " The daily check is off, so drafts appear only when an owner or admin checks what is due."}
      </p>

      {counts.size > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {[...counts].map(([key, n]) => (
            <form key={key} action={approveAll.bind(null, key)}>
              <button
                disabled={key === "chase.at_risk" && !admin}
                className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50"
              >
                Approve all {n} {label(key).toLowerCase()}
                {n === 1 ? "" : "s"} as written
              </button>
            </form>
          ))}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {list.length === 0 && <Empty>Nothing is waiting for approval.</Empty>}
          {list.map((a) => {
            const draft = (a.draft ?? {}) as Draft;
            const refs = (a.record_refs ?? {}) as Refs;
            const to = Array.isArray(draft.to) ? draft.to.filter((x): x is string => typeof x === "string") : [];
            return (
              <Card key={a.id}>
                <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                  <Pill tone={a.action_type_key === "chase.at_risk" ? "risk" : "accent"}>{label(a.action_type_key)}</Pill>
                  {refs.org_id && (
                    <Link href={`/leagues/${refs.org_id}`} className="hover:text-accent">
                      {orgName.get(refs.org_id) ?? "League"}
                    </Link>
                  )}
                  {refs.job_id && (
                    <Link href={`/jobs/${refs.job_id}`} className="text-muted hover:text-accent">
                      {jobName.get(refs.job_id) ?? "Job"}
                    </Link>
                  )}
                  <span className="ml-auto text-xs text-muted">Drafted {when(a.created_at)}</span>
                </div>
                <DraftForm
                  id={a.id}
                  to={to}
                  subject={typeof draft.subject === "string" ? draft.subject : ""}
                  body={typeof draft.body === "string" ? draft.body : ""}
                  canDecide={a.action_type_key !== "chase.at_risk" || admin}
                />
              </Card>
            );
          })}
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
                      <Pill tone={d.status === "rejected" ? "risk" : d.status === "edited" ? "warn" : "ok"}>
                        {d.status === "edited" ? "Approved with changes" : d.status === "approved" ? "Approved" : "Rejected"}
                      </Pill>
                      <span className="text-muted">{label(d.action_type_key)}</span>
                    </p>
                    <p className="truncate">{typeof subject === "string" ? subject : ""}</p>
                    <p className="text-xs text-muted">
                      {who}
                      {d.decided_at ? `, ${when(d.decided_at)}` : ""}
                      {d.decision_note ? `: ${d.decision_note}` : ""}
                    </p>
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
