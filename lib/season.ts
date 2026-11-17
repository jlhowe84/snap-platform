// Mirrors public.season_label() in the database. Season is never stored: it is
// derived from a job's earliest photo day. December, January and February are
// Winter of that calendar year.
export type SeasonName = "Winter" | "Spring" | "Summer" | "Fall";

export function seasonName(month: number): SeasonName {
  if (month === 12 || month <= 2) return "Winter";
  if (month <= 5) return "Spring";
  if (month <= 8) return "Summer";
  return "Fall";
}

/** "YYYY-MM-DD" to a label such as "Spring 2027". */
export function seasonForDate(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  const m = /^(\d{4})-(\d{2})-\d{2}/.exec(isoDate);
  if (!m) return null;
  return `${seasonName(Number(m[2]))} ${Number(m[1])}`;
}

const ORDER: Record<SeasonName, number> = { Winter: 0, Spring: 1, Summer: 2, Fall: 3 };

/** Sort key so seasons list in calendar order. */
export function seasonSortKey(label: string): number {
  const [name, year] = label.split(" ");
  return Number(year) * 10 + (ORDER[name as SeasonName] ?? 9);
}

/** The season a date in the company's time zone falls in, as "Spring 2027". */
export function currentSeason(todayIso: string): string {
  return seasonForDate(todayIso)!;
}
