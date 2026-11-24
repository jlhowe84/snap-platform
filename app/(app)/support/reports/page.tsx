import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Stat, Table, cx } from "@/components/ui";
import { SUPPORT_ROLES } from "@/lib/support/labels";
import { waitingSince } from "@/lib/support/preview";
import {
  REPORT_PERIODS, buildSupportReport, formatHours, periodStart, reportPeriod,
  type ReportConversation,
} from "@/lib/support/report";

export const metadata: Metadata = { title: "Support reports" };

const PERIOD_LABEL: Record<number, string> = { 7: "7 days", 30: "30 days", 90: "90 days", 365: "12 months" };
const COLUMNS = "status, category, first_message_at, first_response_at, closed_at, closed_by";
const PAGE = 1000;

export default async function SupportReportsPage({ searchParams }: PageProps<"/support/reports">) {
  const viewer = await requireStaff(SUPPORT_ROLES);
  const sp = await searchParams;
  const days = reportPeriod(typeof sp.days === "string" ? sp.days : undefined);
  const supabase = await createClient();
  const now = new Date();
  const from = periodStart(days, now).toISOString();

  // Everything that started or was closed in the period, a page at a time.
  const conversations: ReportConversation[] = [];
  for (let at = 0; at < 20 * PAGE; at += PAGE) {
    const { data } = await supabase
      .from("support_conversations")
      .select(COLUMNS)
      .or(`first_message_at.gte.${from},closed_at.gte.${from}`)
      .order("id")
      .range(at, at + PAGE - 1);
    conversations.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) break;
  }

  const [{ data: replies }, { data: people }, { count: backlog }, { data: oldest }] = await Promise.all([
    supabase.from("support_messages").select("author_id").eq("direction", "out").not("author_id", "is", null).gte("sent_at", from).limit(10000),
    supabase.from("profiles").select("id, full_name"),
    supabase.from("support_conversations").select("id", { count: "exact", head: true }).in("status", ["new", "open"]),
    supabase.from("support_conversations").select("id, last_inbound_at").in("status", ["new", "open"])
      .not("last_inbound_at", "is", null).order("last_inbound_at", { ascending: true }).limit(1),
  ]);

  const report = buildSupportReport(conversations, replies ?? [], { days, timeZone: viewer.timeZone, now });
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const peak = Math.max(1, ...report.buckets.map((b) => b.started));
  const oldestWait = waitingSince(oldest?.[0]?.last_inbound_at, now);
  const weekly = days > 14;
  const pct = (n: number | null) => (n === null ? "No replies yet" : `${Math.round(n * 100)}%`);

  return (
    <>
      <PageHeader eyebrow="Customers · Support" title="Support reports">
        <Link href="/support" className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:border-accent hover:text-accent">
          Back to the desk
        </Link>
      </PageHeader>

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Period">
        {REPORT_PERIODS.map((d) => (
          <Link
            key={d}
            href={d === 30 ? "/support/reports" : `/support/reports?days=${d}`}
            aria-current={d === days ? "page" : undefined}
            className={cx(
              "flex min-h-12 items-center rounded-lg border px-4 text-sm font-medium",
              d === days ? "border-accent bg-accent text-accent-ink" : "border-line text-muted hover:border-accent hover:text-accent",
            )}
          >
            Last {PERIOD_LABEL[d]}
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Conversations started" value={report.started} hint={`${report.closed} closed in the same ${PERIOD_LABEL[days]}`} />
        <Stat
          label="Typical first reply"
          value={<span className="text-3xl">{formatHours(report.medianHours)}</span>}
          hint={`The middle one of ${report.answered} answered. Clock time, nights and weekends included.`}
        />
        <Stat label="First reply within a day" value={<span className="text-3xl">{pct(report.withinDay)}</span>} hint={`${report.waiting} from this period still have no reply`} />
        <Stat
          label="Need a reply now"
          value={backlog ?? 0}
          hint={oldestWait ? `Oldest: ${oldestWait.label.toLowerCase()}` : "Nothing is waiting"}
        />
      </div>

      <div className="mt-6 space-y-6">
        <Card title={weekly ? "New conversations by week" : "New conversations by day"}>
          {report.started ? (
            <ul className="space-y-1.5">
              {report.buckets.map((b) => (
                <li key={b.key} className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-3 text-sm">
                  <span className="text-muted">{b.label}</span>
                  <span className="h-4 rounded bg-line/50">
                    <span className="block h-4 rounded bg-accent" style={{ width: `${(b.started / peak) * 100}%` }} />
                  </span>
                  <span className="text-right font-semibold tabular-nums">{b.started}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No mail came in during this period.</Empty>
          )}
          {weekly && report.started > 0 && <p className="mt-3 text-xs text-muted">Each bar is a week starting on the Monday shown.</p>}
        </Card>

        <Card title="By category">
          {report.categories.length ? (
            <Table head={["Category", "Started", "Answered", "Typical first reply"]}>
              {report.categories.map((c) => (
                <tr key={c.name}>
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2 tabular-nums">{c.started}</td>
                  <td className="px-3 py-2 tabular-nums">{c.answered}</td>
                  <td className="px-3 py-2">{formatHours(c.medianHours)}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>Nothing to count yet.</Empty>
          )}
          <p className="mt-3 text-xs text-muted">Set a category on a conversation and it is counted here.</p>
        </Card>

        <Card title="By person">
          {report.people.length ? (
            <Table head={["Person", "Replies sent", "Closed"]}>
              {report.people.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 font-medium">{nameOf.get(p.id) ?? "Someone who has left"}</td>
                  <td className="px-3 py-2 tabular-nums">{p.replies}</td>
                  <td className="px-3 py-2 tabular-nums">{p.closed}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>No replies have been sent from the desk in this period. Replies sent from Gmail count toward reply time but not toward a person.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
