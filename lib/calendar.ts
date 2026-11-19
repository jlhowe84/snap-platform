// Month grid for the calendar page. Dates are calendar dates ("YYYY-MM-DD"),
// handled in UTC so a time zone can never shift a day.

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** "2027-04" from anything that looks like it, else the month of `today`. */
export function monthOf(value: string | undefined, today: string) {
  if (value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return value;
  return today.slice(0, 7);
}

export function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** Whole weeks, Sunday first, covering the month. Each cell is a date and whether it is in the month. */
export function monthGrid(month: string) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  const end = new Date(last);
  end.setUTCDate(last.getUTCDate() + (6 - last.getUTCDay()));
  const weeks: { date: string; inMonth: boolean }[][] = [];
  for (const d = new Date(start); d <= end; ) {
    const week: { date: string; inMonth: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({ date: iso(d), inMonth: d.getUTCMonth() === m - 1 });
      d.setUTCDate(d.getUTCDate() + 1);
    }
    weeks.push(week);
  }
  return { weeks, from: weeks[0][0].date, to: weeks[weeks.length - 1][6].date };
}
