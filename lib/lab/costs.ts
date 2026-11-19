// Lab costs added up for the page, from the rows public.lab_cost_summary()
// returns (one per lab job name, job and calendar year). No network and no
// database here.

export type CostRow = {
  reference: string;
  job_id: string | null;
  job_name: string | null;
  season: string | null;
  year: number;
  invoices: number;
  products: number;
  shipping: number;
  tax: number;
  total: number;
  needs_check: number;
};

export type Sums = { invoices: number; products: number; shipping: number; tax: number; total: number; needsCheck: number };
export type JobCost = Sums & { reference: string; jobId: string | null; jobName: string | null; season: string | null };

const cents = (n: unknown) => Math.round(Number(n ?? 0) * 100);
const zero = (): Sums => ({ invoices: 0, products: 0, shipping: 0, tax: 0, total: 0, needsCheck: 0 });

// Sums are kept in cents while adding, so thousands of small invoices do not drift.
function add(into: Sums, row: CostRow) {
  into.invoices += Number(row.invoices ?? 0);
  into.products += cents(row.products);
  into.shipping += cents(row.shipping);
  into.tax += cents(row.tax);
  into.total += cents(row.total);
  into.needsCheck += Number(row.needs_check ?? 0);
}
const dollars = <T extends Sums>(s: T): T => ({ ...s, products: s.products / 100, shipping: s.shipping / 100, tax: s.tax / 100, total: s.total / 100 });

function seasonKey(label: string | null): number {
  if (!label) return -1;
  const [name, year] = label.split(" ");
  return Number(year) * 10 + ["Winter", "Spring", "Summer", "Fall"].indexOf(name);
}

/**
 * Totals by year (always every year), and for the chosen year (or all of
 * them when `year` is null) the total, the seasons and the jobs.
 */
export function costView(rows: CostRow[], year: number | null) {
  const years = new Map<number, Sums>();
  const seasons = new Map<string, Sums>();
  const jobs = new Map<string, JobCost>();
  const all = zero();
  for (const row of rows) {
    if (!years.has(row.year)) years.set(row.year, zero());
    add(years.get(row.year)!, row);
    if (year !== null && row.year !== year) continue;
    add(all, row);
    const season = row.season ?? "Unknown";
    if (!seasons.has(season)) seasons.set(season, zero());
    add(seasons.get(season)!, row);
    const key = `${row.reference}\u0000${row.job_id ?? ""}`;
    if (!jobs.has(key)) jobs.set(key, { ...zero(), reference: row.reference, jobId: row.job_id, jobName: row.job_name, season: row.season });
    add(jobs.get(key)!, row);
  }
  return {
    all: dollars(all),
    years: [...years].sort((a, b) => b[0] - a[0]).map(([y, s]) => ({ year: y, ...dollars(s) })),
    seasons: [...seasons].sort((a, b) => seasonKey(b[0]) - seasonKey(a[0])).map(([season, s]) => ({ season, ...dollars(s) })),
    jobs: [...jobs.values()].map(dollars).sort((a, b) => b.total - a.total || a.reference.localeCompare(b.reference)),
  };
}

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const usd = (n: number | null | undefined) => (n === null || n === undefined ? "" : USD.format(Number(n)));

/** What a person typed into the search box, made safe to hand to a filter. */
export function searchTerm(raw: string | undefined): string {
  return (raw ?? "").replace(/[^A-Za-z0-9 .'&-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}
