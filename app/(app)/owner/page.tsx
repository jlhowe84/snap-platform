import Link from "next/link";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill, Stat, StatusDot } from "@/components/ui";
import { daysBetween, formatDate, todayIn } from "@/lib/dates";
import { seasonSortKey } from "@/lib/season";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/labels";
import { shiftDay } from "@/lib/orders/plan";
import { change, comparisons, type DayTotal } from "@/lib/orders/view";
import { hoursBetween, missingFor, pickNeeds, riskScore, waitLabel, type Need, type RiskDay } from "@/lib/owner/view";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n >= 1000 ? 0 : 2 });
const count = (n: number) => n.toLocaleString("en-US");

// The stages a season moves through, in the order the work happens.
const PIPELINE = ["held", "planning", "in_production", "at_lab", "delivered", "complete"] as const;
const SWITCHES: [string, string][] = [
  ["orders.sync_enabled", "Order sync, 4 times a day"],
  ["clock.enabled", "Daily reminder clock"],
  ["support.sync_enabled", "Support mail sync"],
  ["lab.invoices_enabled", "Lab invoice pickup"],
];

/**
 * The owner's one screen: what needs them, money against last year, the
 * season by stage, coming photo days at risk, support, lab cost and what is
 * switched on. Owner and admin only. Every read runs as the signed-in
 * person, so RLS decides what comes back.
 */
export default async function OwnerHomePage() {
  const viewer = await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();
  const today = todayIn(viewer.timeZone);
  const now = new Date();
  const horizon = shiftDay(today, 21);
  const monthAgo = shiftDay(today, -30);

  const [
    { data: sync },
    { data: dayTotals },
    { data: oldestOrder },
    { data: jobs },
    { data: coming },
    { count: drafts },
    { data: oldestDraft },
    { data: openSupport },
    { data: labRecent },
    { count: labToCheck },
    { data: settings },
    { count: openTasks },
    { count: lateTasks },
  ] = await Promise.all([
    supabase.from("captura_order_sync").select("history_done, last_run_at, last_error").maybeSingle(),
    supabase.rpc("order_daily_totals", { p_from: shiftDay(today, -800), p_to: today }),
    supabase.from("captura_orders").select("order_date").order("order_date").limit(1).maybeSingle(),
    supabase.from("job_overview").select("id, status, season, first_date").limit(5000),
    supabase
      .from("photo_days")
      .select("id, date, job_id, jobs(name), shifts(status)")
      .gte("date", today)
      .lte("date", horizon)
      .eq("status", "scheduled")
      .order("date")
      .limit(200),
    supabase.from("agent_actions").select("id", { count: "exact", head: true }).eq("status", "proposed"),
    supabase.from("agent_actions").select("created_at").eq("status", "proposed").order("created_at").limit(1).maybeSingle(),
    supabase.from("support_conversations").select("id, last_inbound_at, assignee_id").in("status", ["new", "open"]).limit(2000),
    supabase.from("lab_invoices").select("total").gte("invoice_date", monthAgo).limit(5000),
    supabase.from("lab_invoices").select("id", { count: "exact", head: true }).eq("needs_check", true),
    supabase.from("settings").select("key, value").in("key", SWITCHES.map(([k]) => k)),
    supabase.from("tasks").select("id", { count: "exact", head: true }).in("status", ["todo", "in_progress", "waiting"]),
    supabase.from("tasks").select("id", { count: "exact", head: true }).in("status", ["todo", "in_progress", "waiting"]).lt("due_on", today),
  ]);

  const { data: ready } = coming?.length
    ? await supabase.from("photo_day_readiness").select("photo_day_id, agreement_signed, planning_form, roster, schedule").in("photo_day_id", coming.map((d) => d.id))
    : { data: [] };
  const readyBy = new Map((ready ?? []).map((r) => [r.photo_day_id, r]));

  // Coming photo days with something missing, the most worrying first.
  const risks: (RiskDay & { score: number })[] = (coming ?? [])
    .map((d) => {
      const live = (d.shifts ?? []).filter((s) => s.status !== "cancelled");
      const day: RiskDay = {
        id: d.id,
        jobId: d.job_id,
        name: (d.jobs as { name: string } | null)?.name ?? "Job",
        date: d.date,
        daysOut: daysBetween(today, d.date),
        missing: missingFor(readyBy.get(d.id)),
        crewOpen: live.filter((s) => s.status !== "filled").length,
        noCrew: live.length === 0,
      };
      return { ...day, score: riskScore(day) };
    })
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
  const thisWeek = risks.filter((d) => d.daysOut <= 7);

  // Money, from the order ledger.
  const compares = comparisons((dayTotals ?? []) as DayTotal[], today, sync?.history_done ? (oldestOrder?.order_date ?? null) : null);
  const syncHours = sync?.last_run_at ? hoursBetween(sync.last_run_at, now) : null;
  const flags = new Map((settings ?? []).map((s) => [s.key, s.value === true]));
  const syncOn = flags.get("orders.sync_enabled") ?? false;
  const syncStale = syncOn && (syncHours === null || syncHours > 13);

  // Support: how many wait, and how long the oldest has waited.
  const waiting = openSupport ?? [];
  const oldestInbound = waiting.map((c) => c.last_inbound_at).filter((x): x is string => !!x).sort()[0] ?? null;
  const supportHours = oldestInbound ? hoursBetween(oldestInbound, now) : 0;
  const unassigned = waiting.filter((c) => !c.assignee_id).length;
  const draftHours = oldestDraft?.created_at ? hoursBetween(oldestDraft.created_at, now) : 0;

  const needs = pickNeeds([
    {
      key: "sync",
      title: sync?.last_error ? "The order sync hit an error" : "The order sync has not run lately",
      detail: sync?.last_error ? "Orders may be behind. Open Orders and press Check for new orders." : `Last run ${syncHours === null ? "never" : `${waitLabel(syncHours)} ago`}.`,
      href: "/orders",
      weight: sync?.last_error || syncStale ? 100 : 0,
    },
    {
      key: "week",
      title: `${thisWeek.length} photo day${thisWeek.length === 1 ? "" : "s"} this week with something missing`,
      detail: thisWeek.slice(0, 2).map((d) => `${d.name} (${formatDate(d.date)})`).join(", "),
      href: "#risks",
      weight: thisWeek.length ? 80 + thisWeek.length : 0,
    },
    {
      key: "drafts",
      title: `${drafts ?? 0} draft${drafts === 1 ? "" : "s"} waiting for a decision`,
      detail: `The oldest has waited ${waitLabel(draftHours)}.`,
      href: "/queue",
      weight: drafts ? 40 + Math.min(30, Math.floor(draftHours / 24) * 5) : 0,
    },
    {
      key: "support",
      title: `Support: the oldest message has waited ${waitLabel(supportHours)}`,
      detail: `${waiting.length} open, ${unassigned} with nobody assigned.`,
      href: "/support",
      weight: waiting.length && supportHours >= 24 ? 50 + Math.min(40, Math.floor(supportHours / 24) * 5) : 0,
    },
    {
      key: "lab",
      title: `${labToCheck ?? 0} lab invoice${labToCheck === 1 ? "" : "s"} to check`,
      detail: "The reader could not make the numbers add up.",
      href: "/lab/invoices",
      weight: labToCheck ? 30 : 0,
    },
    {
      key: "tasks",
      title: `${lateTasks ?? 0} task${lateTasks === 1 ? "" : "s"} past due`,
      detail: `${openTasks ?? 0} open in all.`,
      href: "/tasks",
      weight: lateTasks ? 20 + Math.min(20, lateTasks) : 0,
    },
  ] satisfies Need[]);

  // The season by stage: the seasons still in motion, newest first.
  const bySeason = new Map<string, Map<string, number>>();
  for (const j of jobs ?? []) {
    if (!j.season || !j.status) continue;
    const m = bySeason.get(j.season) ?? new Map<string, number>();
    m.set(j.status, (m.get(j.status) ?? 0) + 1);
    bySeason.set(j.season, m);
  }
  const seasons = [...bySeason.entries()]
    .filter(([, m]) => PIPELINE.some((s) => s !== "complete" && (m.get(s) ?? 0) > 0))
    .sort((a, b) => seasonSortKey(b[0]) - seasonSortKey(a[0]))
    .slice(0, 4);

  const labTotal = (labRecent ?? []).reduce((n, r) => n + Number(r.total ?? 0), 0);
  const stamp = new Intl.DateTimeFormat("en-US", { timeZone: viewer.timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <>
      <PageHeader eyebrow={formatDate(today, { weekday: true })} title="Owner home" />

      <Card title="Needs you">
        {needs.length ? (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {needs.map((n) => (
              <li key={n.key}>
                <Link href={n.href} className="block h-full rounded-xl border border-accent/50 bg-accent/10 p-4 transition-colors hover:border-accent">
                  <p className="font-medium">{n.title}</p>
                  {n.detail && <p className="mt-1 text-sm text-muted">{n.detail}</p>}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nothing needs you right now.</Empty>
        )}
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        {compares.map((c) => {
          const pct = change(c.now.gross, c.before.gross);
          return (
            <Stat
              key={c.label}
              label={`Orders, ${c.label.toLowerCase()}`}
              value={usd(c.now.gross)}
              hint={
                `${count(c.now.orders)} orders. A year ago ${usd(c.before.gross)}` +
                (pct === null ? "." : `, ${pct > 0 ? "up" : pct < 0 ? "down" : "level at"} ${Math.abs(pct)}%.`) +
                (c.complete ? "" : " (history incomplete)")
              }
            />
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">
        From the Captura order ledger, gross, SNAP&apos;s own orders left out.{" "}
        {sync?.last_run_at ? `Read ${stamp.format(new Date(sync.last_run_at))}.` : "Not read yet."}{" "}
        <Link href="/orders" className="text-accent hover:underline">Open Orders</Link>
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Card id="risks" title={`At risk, next 21 days (${risks.length})`} action={<Link href="/calendar" className="text-sm text-accent hover:underline">Calendar</Link>}>
            {risks.length ? (
              <ul className="divide-y divide-line">
                {risks.slice(0, 12).map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                    <div className="min-w-0">
                      <Link href={`/jobs/${d.jobId}`} className="font-medium hover:text-accent">{d.name}</Link>
                      <p className="text-muted">
                        {formatDate(d.date, { weekday: true })} · {d.daysOut === 0 ? "today" : d.daysOut === 1 ? "tomorrow" : `in ${d.daysOut} days`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {d.missing.map((m) => <Pill key={m} tone={d.daysOut <= 7 ? "risk" : "warn"}>No {m}</Pill>)}
                      {d.noCrew && <Pill tone={d.daysOut <= 7 ? "risk" : "warn"}>No shifts</Pill>}
                      {!d.noCrew && d.crewOpen > 0 && <Pill tone={d.daysOut <= 7 ? "risk" : "warn"}>{d.crewOpen} shift{d.crewOpen === 1 ? "" : "s"} open</Pill>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>{coming?.length ? `All ${coming.length} photo days in the next 21 days are ready.` : "No photo days in the next 21 days."}</Empty>
            )}
            {risks.length > 12 && <p className="mt-2 text-xs text-muted">And {risks.length - 12} more.</p>}
          </Card>

          <Card title="Seasons in motion" action={<Link href="/jobs" className="text-sm text-accent hover:underline">All jobs</Link>}>
            {seasons.length ? (
              <ul className="divide-y divide-line">
                {seasons.map(([season, m]) => (
                  <li key={season} className="py-3">
                    <p className="font-medium">{season}</p>
                    <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
                      {PIPELINE.filter((s) => (m.get(s) ?? 0) > 0).map((s) => (
                        <StatusDot key={s} tone={STATUS_TONE[s]} label={`${m.get(s)} ${STATUS_LABEL[s].toLowerCase()}`} />
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No season has open jobs.</Empty>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card title="Waiting" >
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
              <Row href="/support" label="Support conversations open" value={count(waiting.length)} />
              <Row href="/support" label="Oldest support wait" value={waiting.length ? waitLabel(supportHours) : "none"} />
              <Row href="/queue" label="Drafts for a decision" value={count(drafts ?? 0)} />
              <Row href="/tasks" label="Open tasks" value={count(openTasks ?? 0)} />
              <Row href="/tasks" label="Tasks past due" value={count(lateTasks ?? 0)} />
            </dl>
          </Card>

          <Card title="Lab cost, last 30 days" action={<Link href="/lab" className="text-sm text-accent hover:underline">Lab costs</Link>}>
            <p className="font-display text-4xl font-semibold leading-none">{usd(labTotal)}</p>
            <p className="mt-2 text-sm text-muted">
              {count(labRecent?.length ?? 0)} invoices read from the lab&apos;s emails{labToCheck ? `, ${labToCheck} to check` : ""}.
            </p>
          </Card>

          <Card title="What is switched on" action={<Link href="/settings" className="text-sm text-accent hover:underline">Settings</Link>}>
            <ul className="space-y-2">
              {SWITCHES.map(([key, label]) => (
                <li key={key}>
                  <StatusDot tone={flags.get(key) ? "ok" : "muted"} label={`${label}: ${flags.get(key) ? "on" : "off"}`} />
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              {sync?.last_error
                ? "The last order sync reported an error."
                : sync?.last_run_at
                  ? `Orders last synced ${stamp.format(new Date(sync.last_run_at))}.`
                  : "Orders have not synced yet."}
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    <>
      <dt><Link href={href} className="text-muted hover:text-accent">{label}</Link></dt>
      <dd className="text-right font-medium">{value}</dd>
    </>
  );
}
