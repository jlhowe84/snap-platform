import type { Metadata } from "next";
import Link from "next/link";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Stat, Table, cx } from "@/components/ui";
import { formatDate, todayIn } from "@/lib/dates";
import { shiftDay } from "@/lib/orders/plan";
import { change, comparisons, galleryLines, seasonsOf, sum, type DayTotal, type GalleryTotal } from "@/lib/orders/view";
import { CheckOrders, LinkGallery } from "./forms";

export const metadata: Metadata = { title: "Orders" };

// Reading Captura orders can take most of a minute.
export const maxDuration = 60;

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n >= 1000 ? 0 : 2 });
const count = (n: number) => n.toLocaleString("en-US");

function Delta({ now, before }: { now: number; before: number }) {
  const c = change(now, before);
  if (c === null) return <span className="text-muted">nothing to compare</span>;
  return <span className={c < 0 ? "text-risk" : "text-ok"}>{`${c > 0 ? "+" : ""}${c}%`}</span>;
}

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const viewer = await requireStaff(OFFICE_ROLES);
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayIn(viewer.timeZone);

  const [{ data: state }, { data: days }, { data: galleries }, { count: stored }, { data: oldest }, { data: jobs }] = await Promise.all([
    supabase.from("captura_order_sync").select("next_from, history_done, last_run_at, last_error").maybeSingle(),
    supabase.rpc("order_daily_totals", { p_from: shiftDay(today, -800), p_to: today }),
    supabase.rpc("order_gallery_totals", {}),
    supabase.from("captura_orders").select("order_id", { count: "exact", head: true }),
    supabase.from("captura_orders").select("order_date").order("order_date").limit(1).maybeSingle(),
    supabase.from("jobs").select("id, name").order("name").limit(2000),
  ]);

  const rows = (galleries ?? []) as GalleryTotal[];
  const linked = [...new Set(rows.map((r) => r.job_id).filter((x): x is string => !!x))];
  const { data: firstDays } = linked.length
    ? await supabase.from("photo_days").select("job_id, date").in("job_id", linked).order("date")
    : { data: [] as { job_id: string; date: string }[] };
  const firstDayOfJob = new Map<string, string>();
  for (const d of firstDays ?? []) if (!firstDayOfJob.has(d.job_id)) firstDayOfJob.set(d.job_id, d.date);

  const lines = galleryLines(rows, firstDayOfJob);
  const seasons = seasonsOf(lines);
  const picked = typeof sp.season === "string" && seasons.includes(sp.season) ? sp.season : (seasons[0] ?? null);
  const shown = picked ? lines.filter((l) => l.season === picked) : lines;
  const totals = sum(shown);
  const unlinked = shown.filter((l) => !l.jobId).length;
  const historyLoading = !state?.history_done;
  // The ledger holds every day from its oldest order once the history is in.
  const compares = comparisons((days ?? []) as DayTotal[], today, state?.history_done ? (oldest?.order_date ?? null) : null);
  const jobOptions = (jobs ?? []).map((j) => ({ id: j.id, label: j.name }));
  const when = new Intl.DateTimeFormat("en-US", { timeZone: viewer.timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <>
      <PageHeader eyebrow="Money" title="Orders">
        <CheckOrders loading={historyLoading} />
      </PageHeader>

      <p className="mb-6 text-sm text-muted">
        {state?.last_run_at ? `Last read from Captura ${when.format(new Date(state.last_run_at))}. ` : "Orders have not been read from Captura yet. "}
        {stored ? `${count(stored)} orders stored${oldest?.order_date ? `, the oldest from ${formatDate(oldest.order_date)}` : ""}. ` : ""}
        {state?.last_run_at && historyLoading ? `Older orders are still loading, up to ${formatDate(state.next_from)} so far. ` : ""}
        {state?.last_error ? <span className="text-risk">{state.last_error}</span> : null}
      </p>

      {!stored ? (
        <Empty>No orders are stored yet. Use Load the order history to read them from Captura. It reads a few weeks at a time and keeps going until it is done.</Empty>
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Against the same days a year ago</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {compares.map((c) => (
                <Stat
                  key={c.label}
                  label={c.label}
                  value={usd(c.now.gross)}
                  hint={
                    c.complete || c.before.orders > 0
                      ? `${count(c.now.orders)} orders. A year ago ${usd(c.before.gross)} from ${count(c.before.orders)} orders${c.complete ? "" : " (still loading)"}.`
                      : `${count(c.now.orders)} orders. Last year is still loading.`
                  }
                />
              ))}
            </div>
            <p className="mt-2 text-sm">
              {compares.map((c) => (
                <span key={c.label} className="mr-4 inline-block">
                  {c.label}: <Delta now={c.now.gross} before={c.before.gross} />
                </span>
              ))}
            </p>
            <p className="mt-1 text-xs text-muted">Gross is what customers paid, tax and shipping included. Refunds are not taken off. SNAP&apos;s own orders are left out.</p>
          </section>

          <nav className="flex flex-wrap gap-2" aria-label="Season">
            {seasons.map((s) => (
              <Link
                key={s}
                href={`/orders?season=${encodeURIComponent(s)}`}
                aria-current={s === picked ? "page" : undefined}
                className={cx(
                  "rounded-lg border px-3 py-1.5 text-sm font-medium",
                  s === picked ? "border-accent bg-accent text-accent-ink" : "border-line text-muted hover:border-accent hover:text-accent",
                )}
              >
                {s}
              </Link>
            ))}
          </nav>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Orders" value={count(totals.orders)} hint={`${count(totals.prepay)} prepay (${totals.orders ? Math.round((totals.prepay / totals.orders) * 100) : 0}%)`} />
            <Stat label="Gross" value={usd(totals.gross)} hint={`${usd(totals.orders ? totals.gross / totals.orders : 0)} an order`} />
            <Stat label="Net pay" value={usd(totals.netPay)} hint="What Captura pays SNAP after its fees" />
            <Stat label="Refunded" value={usd(totals.refunded)} hint="Shown apart, not taken off the gross" />
          </div>

          <Card title={picked ? `${picked} galleries` : "Galleries"}>
            {unlinked > 0 && (
              <p className="mb-3 text-sm text-muted">
                {unlinked} {unlinked === 1 ? "gallery is" : "galleries are"} not linked to a job yet. Linking one sets the job&apos;s Captura gallery, so its orders show on the job.
              </p>
            )}
            <Table head={["Gallery", "Job", "Orders", "Prepay", "Gross", "Net pay", "Refunded", "Buyers", "Last order"]}>
              {shown.map((l) => (
                <tr key={l.galleryId} className="align-top">
                  <td className="px-3 py-2">
                    <span className="font-medium">{l.title}</span>
                    <span className="block text-xs text-muted">{l.galleryId}</span>
                  </td>
                  <td className="px-3 py-2">
                    {l.jobId ? (
                      <Link href={`/jobs/${l.jobId}`} className="hover:text-accent">
                        {l.jobName}
                      </Link>
                    ) : (
                      <LinkGallery galleryId={l.galleryId} jobId={null} jobs={jobOptions} />
                    )}
                  </td>
                  <td className="px-3 py-2">{count(l.orders)}</td>
                  <td className="px-3 py-2">{l.orders ? `${Math.round((l.prepay / l.orders) * 100)}%` : ""}</td>
                  <td className="px-3 py-2 font-semibold">{usd(l.gross)}</td>
                  <td className="px-3 py-2">{usd(l.netPay)}</td>
                  <td className="px-3 py-2">{l.refunded ? <span className="text-risk">{usd(l.refunded)}</span> : <span className="text-muted">None</span>}</td>
                  <td className="px-3 py-2">{count(l.buyers)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(l.lastOrder)}</td>
                </tr>
              ))}
            </Table>
            <p className="mt-3 text-xs text-muted">
              A gallery linked to a job counts in the season of the job&apos;s first photo day. One that is not counts in the season of its first order. Buyers are
              distinct billing emails, counted without storing them.
            </p>
          </Card>
        </div>
      )}
    </>
  );
}
