import { seasonForDate, seasonSortKey } from "@/lib/season";
import { shiftDay } from "./plan";

// What the orders page shows, worked out from the ledger's totals. Pure.

export type DayTotal = { order_date: string; orders: number; prepay_orders: number; gross: number | string; net_pay: number | string };

export type GalleryTotal = {
  gallery_id: number;
  title: string | null;
  job_id: string | null;
  job_name: string | null;
  first_order_on: string | null;
  last_order_on: string | null;
  orders: number;
  prepay_orders: number;
  gallery_orders: number;
  refunded_orders: number;
  internal_orders: number;
  gross: number | string;
  refunded: number | string;
  net_pay: number | string;
  buyers: number;
};

export type Span = { from: string; to: string; orders: number; gross: number; netPay: number };
export type Compare = { label: string; now: Span; before: Span; complete: boolean };

const n = (v: number | string | null | undefined) => (v === null || v === undefined ? 0 : Number(v) || 0);
const cents = (x: number) => Math.round(x * 100) / 100;

function span(days: DayTotal[], from: string, to: string): Span {
  let orders = 0;
  let gross = 0;
  let netPay = 0;
  for (const d of days) {
    if (d.order_date < from || d.order_date > to) continue;
    orders += d.orders;
    gross += n(d.gross);
    netPay += n(d.net_pay);
  }
  return { from, to, orders, gross: cents(gross), netPay: cents(netPay) };
}

/** The same calendar day a year earlier (Feb 29 becomes Feb 28). */
export function yearBefore(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const day = m === 2 && d === 29 ? 28 : d;
  return `${y - 1}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Three comparisons with the same days a year earlier: the last seven days,
 * this month so far, and the last twelve months against the twelve before.
 * `historyFrom` is the first day the ledger is known to hold; a comparison
 * reaching further back is marked incomplete.
 */
export function comparisons(days: DayTotal[], today: string, historyFrom: string | null): Compare[] {
  const complete = (from: string) => !!historyFrom && from >= historyFrom;
  const week = { from: shiftDay(today, -6), to: today };
  const month = { from: `${today.slice(0, 8)}01`, to: today };
  const year = { from: shiftDay(yearBefore(today), 1), to: today };
  const prior = { from: shiftDay(yearBefore(year.from), 0), to: shiftDay(year.from, -1) };
  return [
    { label: "Last 7 days", now: span(days, week.from, week.to), before: span(days, yearBefore(week.from), yearBefore(week.to)), complete: complete(yearBefore(week.from)) },
    { label: "This month so far", now: span(days, month.from, month.to), before: span(days, yearBefore(month.from), yearBefore(month.to)), complete: complete(yearBefore(month.from)) },
    { label: "Last 12 months", now: span(days, year.from, year.to), before: span(days, prior.from, prior.to), complete: complete(prior.from) },
  ];
}

/** Change as a whole percent, or null when there is nothing to compare with. */
export function change(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

export type GalleryLine = {
  galleryId: number;
  title: string;
  jobId: string | null;
  jobName: string | null;
  season: string | null;
  firstOrder: string | null;
  lastOrder: string | null;
  orders: number;
  prepay: number;
  refundedOrders: number;
  gross: number;
  refunded: number;
  netPay: number;
  buyers: number;
};

/**
 * Galleries with their season: a gallery tied to a job takes the season of
 * the job's first photo day; one that is not takes the season of its first
 * order. Galleries with only internal orders are left out.
 */
export function galleryLines(rows: GalleryTotal[], firstDayOfJob: Map<string, string>): GalleryLine[] {
  return rows
    .filter((r) => r.orders > 0)
    .map((r) => ({
      galleryId: r.gallery_id,
      title: r.title ?? `Gallery ${r.gallery_id}`,
      jobId: r.job_id,
      jobName: r.job_name,
      season: seasonForDate((r.job_id && firstDayOfJob.get(r.job_id)) || r.first_order_on),
      firstOrder: r.first_order_on,
      lastOrder: r.last_order_on,
      orders: r.orders,
      prepay: r.prepay_orders,
      refundedOrders: r.refunded_orders,
      gross: cents(n(r.gross)),
      refunded: cents(n(r.refunded)),
      netPay: cents(n(r.net_pay)),
      buyers: r.buyers,
    }))
    .sort((a, b) => b.gross - a.gross);
}

export function seasonsOf(lines: GalleryLine[]): string[] {
  return [...new Set(lines.map((l) => l.season).filter((s): s is string => !!s))].sort((a, b) => seasonSortKey(b) - seasonSortKey(a));
}

export function sum(lines: GalleryLine[]) {
  const t = lines.reduce(
    (a, l) => ({ orders: a.orders + l.orders, prepay: a.prepay + l.prepay, gross: a.gross + l.gross, refunded: a.refunded + l.refunded, netPay: a.netPay + l.netPay, buyers: a.buyers + l.buyers }),
    { orders: 0, prepay: 0, gross: 0, refunded: 0, netPay: 0, buyers: 0 },
  );
  return { ...t, gross: cents(t.gross), refunded: cents(t.refunded), netPay: cents(t.netPay) };
}

export type LabTotal = { gallery_id: number | null; lab_orders: number; lab_total: number | string };

/** What the lab charged for each gallery, from public.lab_gallery_totals(). */
export function labByGallery(rows: LabTotal[]): Map<number, { orders: number; total: number }> {
  const m = new Map<number, { orders: number; total: number }>();
  for (const r of rows) {
    if (r.gallery_id === null) continue;
    m.set(Number(r.gallery_id), { orders: r.lab_orders, total: n(r.lab_total) });
  }
  return m;
}

/** Lab orders and charges over the galleries shown. */
export function labSum(lines: { galleryId: number }[], lab: Map<number, { orders: number; total: number }>) {
  let orders = 0;
  let total = 0;
  for (const l of lines) {
    const x = lab.get(l.galleryId);
    if (!x) continue;
    orders += x.orders;
    total += x.total;
  }
  return { orders, total: cents(total) };
}
