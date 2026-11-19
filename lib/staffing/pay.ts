// Payroll sums and the export file, with no database so they can be tested.

export type PayLine = {
  crew_member_id: string;
  full_name: string;
  work_date: string;
  position: string | null;
  description: string | null;
  rate: number | null;
  unit: string | null;
  hours: number | null;
  base: number;
  miles: number;
  mileage: number;
  adjustment: number;
  total: number;
  status: string;
  note: string | null;
};

export type PayTotal = {
  crew_member_id: string;
  full_name: string;
  lines: number;
  base: number;
  miles: number;
  mileage: number;
  adjustment: number;
  total: number;
  unpriced: number;
};

const cents = (n: number) => Math.round(n * 100);

/** One row per person, highest total first. Sums in cents so they add up exactly. */
export function payTotals(lines: PayLine[]): PayTotal[] {
  const by = new Map<string, PayTotal & { _c: Record<string, number> }>();
  for (const l of lines) {
    const t =
      by.get(l.crew_member_id) ??
      { crew_member_id: l.crew_member_id, full_name: l.full_name, lines: 0, base: 0, miles: 0, mileage: 0, adjustment: 0, total: 0, unpriced: 0, _c: { base: 0, mileage: 0, adjustment: 0, total: 0, miles: 0 } };
    t.lines += 1;
    t._c.base += cents(l.base);
    t._c.mileage += cents(l.mileage);
    t._c.adjustment += cents(l.adjustment);
    t._c.total += cents(l.total);
    t._c.miles += Math.round(l.miles * 10);
    if (l.rate == null) t.unpriced += 1;
    by.set(l.crew_member_id, t);
  }
  return [...by.values()]
    .map(({ _c, ...t }) => ({ ...t, base: _c.base / 100, mileage: _c.mileage / 100, adjustment: _c.adjustment / 100, total: _c.total / 100, miles: _c.miles / 10 }))
    .sort((a, b) => b.total - a.total || a.full_name.localeCompare(b.full_name));
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  // Keep a spreadsheet from reading a cell as a formula.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The payroll report as CSV: one line per shift, then one total per person. */
export function payCsv(lines: PayLine[]): string {
  const head = ["Name", "Date", "Job", "Position", "Rate", "Per", "Hours", "Base", "Miles", "Mileage", "Adjustment", "Total", "Status", "Note"];
  const rows = [...lines]
    .sort((a, b) => a.full_name.localeCompare(b.full_name) || a.work_date.localeCompare(b.work_date))
    .map((l) => [l.full_name, l.work_date, l.description, l.position, l.rate?.toFixed(2), l.unit, l.hours, l.base.toFixed(2), l.miles, l.mileage.toFixed(2), l.adjustment.toFixed(2), l.total.toFixed(2), l.status, l.note]);
  const totals = payTotals(lines).map((t) => [t.full_name, "", "Total", "", "", "", "", t.base.toFixed(2), t.miles, t.mileage.toFixed(2), t.adjustment.toFixed(2), t.total.toFixed(2), "", t.unpriced ? `${t.unpriced} without a rate` : ""]);
  return [head, ...rows, [], ...totals].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** The default report range: the last full period, ending yesterday. */
export function defaultPeriod(today: string, days: number): { from: string; to: string } {
  const end = new Date(`${today}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(1, days) + 1);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}
