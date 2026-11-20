import type { Metadata } from "next";
import Link from "next/link";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Stat, Table, cx } from "@/components/ui";
import { formatDate, todayIn } from "@/lib/dates";
import { shiftDay } from "@/lib/orders/plan";
import { change, comparisons, galleryLines, seasonsOf, sum, type DayTotal, type GalleryTotal } from "@/lib/orders/view";
import { likelyJobs, likelyOptions, type JobChoice } from "@/lib/orders/match";
import { CheckOrders, LinkGallery, UnlinkJob } from "./forms";

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
  // Every job's first photo day: it sets a linked gallery's season and tells
  // apart the jobs of one league, which share a name.
  const [{ data: allDays }, { data: links }] = await Promise.all([
    supabase.from("photo_days").select("job_id, date").order("date").limit(10000),
    supabase.from("job_links").select("job_id, captura_gallery_id").not("captura_gallery_id", "is", null).limit(5000),
  ]);
  const firstDayOfJob = new Map<string, string>();
  for (const d of allDays ?? []) if (!firstDayOfJob.has(d.job_id)) firstDayOfJob.set(d.job_id, d.date);
  const choices: JobChoice[] = (jobs ?? []).map((j) => ({ id: j.id, name: j.name, firstDay: firstDayOfJob.get(j.id) ?? null }));
  const choiceById = new Map(choices.map((c) => [c.id, c]));
  const jobsOfGallery = new Map<number, JobChoice[]>();
  for (const l of links ?? []) {
    const c = choiceById.get(l.job_id);
    if (!c || l.captura_gallery_id === null) continue;
    jobsOfGallery.set(l.captura_gallery_id, [...(jobsOfGallery.get(l.captura_gallery_id) ?? []), c]);
  }
  for (const list of jobsOfGallery.values()) list.sort((a, b) => (a.firstDay ?? "9").localeCompare(b.firstDay ?? "9"));
  const optionOf = (c: JobChoice) => ({ id: c.id, label: `${c.name} · ${c.firstDay ? formatDate(c.firstDay) : "no photo day yet"}` });
  const lines = galleryLines(rows, firstDayOfJob);
  const seasons = seasonsOf(lines);
  const picked = typeof sp.season === "string" && seasons.includes(sp.season) ? sp.season : (seasons[0] ?? null);
  const shown = picked ? lines.filter((l) => l.season === picked) : lines;
  const totals = sum(shown);
  const unlinked = shown.filter((l) => !l.jobId).length;
  const historyLoading = !state?.history_done;
  // The ledger holds every day from its oldest order once the history is in.
  const compares = comparisons((days ?? []) as DayTotal[], today, state?.history_done ? (oldest?.order_date ?? null) : null);
  const jobOptions = [...choices].sort((a, b) => (b.firstDay ?? "").localeCompare(a.firstDay ?? "") || a.name.localeCompare(b.name)).map(optionOf);
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
                {unlinked} {unlinked === 1 ? "gallery is" : "galleries are"} not linked to a job yet. Each job shows its photo day, and the ones that look like the gallery&apos;s are listed first. Linking puts the gallery&apos;s orders on that job.
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
                    {(() => {
                      const linked = jobsOfGallery.get(l.galleryId) ?? [];
                      const taken = new Set(linked.map((j) => j.id));
                      const likely = likelyOptions(
                        likelyJobs({ title: l.title, firstOrder: l.firstOrder, lastOrder: l.lastOrder }, choices).filter((j) => !taken.has(j.id)),
                        formatDate,
                      );
                      const rest = jobOptions.filter((j) => !taken.has(j.id));
                      if (!linked.length) return <LinkGallery galleryId={l.galleryId} likely={likely} jobs={rest} />;
                      return (
                        <div className="space-y-1">
                          {linked.map((j) => (
                            <div key={j.id} className="flex flex-wrap items-baseline gap-x-2">
                              <Link href={`/jobs/${j.id}`} className="hover:text-accent">
                                {j.name}
                              </Link>
                              <span className="text-xs text-muted">{j.firstDay ? formatDate(j.firstDay) : "no photo day yet"}</span>
                              <UnlinkJob jobId={j.id} label={j.name} />
                            </div>
                          ))}
                          <details className="text-xs text-muted">
                            <summary className="cursor-pointer hover:text-accent">Shared with another job?</summary>
                            <div className="mt-1">
                              <LinkGallery galleryId={l.galleryId} likely={likely} jobs={rest} another />
                            </div>
                          </details>
                        </div>
                      );
                    })()}
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
