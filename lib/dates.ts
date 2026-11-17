// Photo-day dates are plain calendar dates ("YYYY-MM-DD") with no time zone.
// Format them in UTC so a date never shifts by a day on the server or in a
// browser west of Greenwich.

export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function formatDate(iso: string | null | undefined, opts: { weekday?: boolean } = {}) {
  if (!iso) return "No date";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: opts.weekday ? "short" : undefined,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export function formatRange(first: string | null, last: string | null) {
  if (!first) return "No date yet";
  if (!last || last === first) return formatDate(first, { weekday: true });
  return `${formatDate(first)} to ${formatDate(last)}`;
}

/** "13:30:00" to "1:30 PM". */
export function formatTime(t: string | null | undefined) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  const hour = ((h + 11) % 12) + 1;
  return `${hour}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function daysBetween(fromIso: string, toIso: string) {
  const a = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}
