import type { Metadata } from "next";
import Link from "next/link";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill, Stat, Table } from "@/components/ui";
import { formatDate, todayIn } from "@/lib/dates";
import { OBLIGATION_KIND_LABEL, type ObligationKind } from "@/lib/delivery/terms";

export const metadata: Metadata = { title: "Owed" };

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * Everything owed across all jobs: rebate and sponsorship checks, donations,
 * facility fees, delivery boxes to drop off, and charges a league owes.
 * Open ones first by due date; each is changed and closed on its job's page.
 */
export default async function ObligationsPage({ searchParams }: PageProps<"/obligations">) {
  const viewer = await requireStaff(OFFICE_ROLES);
  const sp = await searchParams;
  const showClosed = sp.show === "closed";
  const supabase = await createClient();
  let q = supabase
    .from("job_obligations")
    .select("id, job_id, kind, direction, title, amount, due_on, owner_id, status, closed_at, closed_note, quickbooks_ref, jobs(name, organizations(name))")
    .order("due_on", { ascending: true, nullsFirst: false })
    .limit(500);
  q = showClosed ? q.neq("status", "open").order("closed_at", { ascending: false }) : q.eq("status", "open");
  const [{ data: rows }, { data: people }] = await Promise.all([q, supabase.from("profiles").select("id, full_name")]);
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name ?? "Someone"]));
  const today = todayIn(viewer.timeZone);
  const list = rows ?? [];
  const out = list.filter((r) => r.direction === "owed_out");
  const owedOut = out.reduce((t, r) => t + Number(r.amount ?? 0), 0);
  const owedIn = list.filter((r) => r.direction === "owed_in").reduce((t, r) => t + Number(r.amount ?? 0), 0);
  const late = list.filter((r) => r.status === "open" && r.due_on && r.due_on < today).length;
  const noAmount = out.filter((r) => r.amount === null && r.kind !== "delivery_box").length;

  return (
    <>
      <PageHeader eyebrow="Money" title="Owed">
        <Link
          href={showClosed ? "/obligations" : "/obligations?show=closed"}
          className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:border-accent hover:text-accent"
        >
          {showClosed ? "Show open" : "Show closed"}
        </Link>
      </PageHeader>
      <p className="mb-4 max-w-3xl text-sm text-muted">
        What SNAP owes leagues after a season, and what leagues owe SNAP. Rebates and sponsorships are worked out at close-out from each league&apos;s terms and
        the order ledger; rebates count prepay sales before tax. Change, close or add one on the job&apos;s page.
      </p>
      {!showClosed && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Owed to leagues" value={usd(owedOut)} />
          <Stat label="Leagues owe us" value={usd(owedIn)} />
          <Stat label="Past due" value={String(late)} />
          <Stat label="Need an amount" value={String(noAmount)} />
        </div>
      )}
      <Card title={showClosed ? "Closed" : "Open"}>
        {list.length ? (
          <Table head={["Due", "League and job", "What", "Amount", showClosed ? "Closed" : "Owner"]}>
            {list.map((r) => {
              const job = r.jobs as { name: string; organizations: { name: string } | null } | null;
              const isLate = r.status === "open" && !!r.due_on && r.due_on < today;
              return (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className={isLate ? "px-3 py-2 font-semibold text-risk" : "px-3 py-2"}>{r.due_on ? formatDate(r.due_on) : <span className="text-muted">None</span>}</td>
                  <td className="px-3 py-2">
                    <Link href={`/jobs/${r.job_id}#delivery`} className="hover:text-accent">
                      {job?.organizations?.name ?? job?.name ?? "Job"}
                    </Link>
                    {job?.organizations?.name && <span className="block text-xs text-muted">{job.name}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs uppercase tracking-wide text-muted">{OBLIGATION_KIND_LABEL[r.kind as ObligationKind] ?? r.kind}</span>
                    <span className="block">{r.title}</span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.amount === null ? (r.kind === "delivery_box" ? "" : <Pill tone="warn">Amount needed</Pill>) : `${r.direction === "owed_in" ? "They owe " : ""}${usd(Number(r.amount))}`}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {showClosed
                      ? [r.status === "void" ? "Not owed" : "Closed", r.closed_note, r.quickbooks_ref ? `QuickBooks ${r.quickbooks_ref}` : null].filter(Boolean).join(" · ")
                      : (r.owner_id && nameOf.get(r.owner_id)) || "No owner"}
                  </td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty>{showClosed ? "Nothing closed yet." : "Nothing owed right now. Amounts are listed at each job's close-out."}</Empty>
        )}
      </Card>
    </>
  );
}
