// Support desk reports: how much mail came in and how fast it was answered.
// Pure sums over rows the page reads, so the rules can be tested.
//
// Response time is clock time from the customer's first message to the first
// reply. It does not stop for nights or weekends.

export const REPORT_PERIODS = [7, 30, 90, 365] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export function reportPeriod(v: string | undefined): ReportPeriod {
  const n = Number(v);
  return (REPORT_PERIODS as readonly number[]).includes(n) ? (n as ReportPeriod) : 30;
}

export type ReportConversation = {
  status: string;
  category: string | null;
  first_message_at: string | null;
  first_response_at: string | null;
  closed_at: string | null;
  closed_by: string | null;
};

export type ReportReply = { author_id: string | null };

export type ReportBucket = { key: string; label: string; started: number };
export type ReportCategory = { name: string; started: number; answered: number; medianHours: number | null };
export type ReportPerson = { id: string; replies: number; closed: number };

export type SupportReport = {
  started: number;
  answered: number;
  waiting: number;
  closed: number;
  medianHours: number | null;
  /** Share of answered conversations that got their first reply within 24 hours, 0 to 1. */
  withinDay: number | null;
  buckets: ReportBucket[];
  categories: ReportCategory[];
  people: ReportPerson[];
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Hours from the first message to the first reply, or null when there is none or the clock runs backward. */
export function responseHours(c: Pick<ReportConversation, "first_message_at" | "first_response_at">): number | null {
  if (!c.first_message_at || !c.first_response_at) return null;
  const h = (new Date(c.first_response_at).getTime() - new Date(c.first_message_at).getTime()) / HOUR;
  return Number.isFinite(h) && h >= 0 ? h : null;
}

/** "Under an hour", "5 hours", "2.5 days". */
export function formatHours(h: number | null): string {
  if (h === null) return "No replies yet";
  if (h < 1) return "Under an hour";
  if (h < 24) {
    const n = Math.round(h);
    return `${n} hour${n === 1 ? "" : "s"}`;
  }
  const d = Math.round((h / 24) * 10) / 10;
  return `${d} day${d === 1 ? "" : "s"}`;
}

function localDate(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The Monday on or before a calendar date. */
function weekStart(iso: string): string {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return addDays(iso, -((dow + 6) % 7));
}

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${iso}T00:00:00Z`));
}

/** When the period starts: this moment, `days` days ago. */
export function periodStart(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * DAY);
}

export function buildSupportReport(
  conversations: ReportConversation[],
  replies: ReportReply[],
  opts: { days: number; timeZone: string; now?: Date },
): SupportReport {
  const now = opts.now ?? new Date();
  const from = periodStart(opts.days, now).getTime();
  const inPeriod = (iso: string | null) => !!iso && new Date(iso).getTime() >= from && new Date(iso).getTime() <= now.getTime();

  const started = conversations.filter((c) => inPeriod(c.first_message_at));
  const hours = started.map(responseHours).filter((h): h is number => h !== null);
  const closed = conversations.filter((c) => inPeriod(c.closed_at));

  // A bar per day up to two weeks, a bar per week after that.
  const weekly = opts.days > 14;
  const today = localDate(now, opts.timeZone);
  const first = localDate(new Date(from + 1), opts.timeZone);
  const buckets: ReportBucket[] = [];
  for (let d = weekly ? weekStart(first) : first; d <= today; d = addDays(d, weekly ? 7 : 1)) {
    buckets.push({ key: d, label: shortDate(d), started: 0 });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const c of started) {
    const day = localDate(new Date(c.first_message_at as string), opts.timeZone);
    const b = byKey.get(weekly ? weekStart(day) : day);
    if (b) b.started += 1;
  }

  const cats = new Map<string, ReportConversation[]>();
  for (const c of started) {
    const name = c.category?.trim() || "No category";
    cats.set(name, [...(cats.get(name) ?? []), c]);
  }
  const categories = [...cats.entries()]
    .map(([name, rows]) => {
      const h = rows.map(responseHours).filter((x): x is number => x !== null);
      return { name, started: rows.length, answered: h.length, medianHours: median(h) };
    })
    .sort((a, b) => b.started - a.started || a.name.localeCompare(b.name));

  const people = new Map<string, ReportPerson>();
  const person = (id: string) => {
    let p = people.get(id);
    if (!p) people.set(id, (p = { id, replies: 0, closed: 0 }));
    return p;
  };
  for (const r of replies) if (r.author_id) person(r.author_id).replies += 1;
  for (const c of closed) if (c.closed_by) person(c.closed_by).closed += 1;

  return {
    started: started.length,
    answered: hours.length,
    waiting: started.filter((c) => !c.first_response_at && (c.status === "new" || c.status === "open")).length,
    closed: closed.length,
    medianHours: median(hours),
    withinDay: hours.length ? hours.filter((h) => h <= 24).length / hours.length : null,
    buckets,
    categories,
    people: [...people.values()].sort((a, b) => b.replies + b.closed - (a.replies + a.closed)),
  };
}
