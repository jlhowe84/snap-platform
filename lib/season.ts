// Mirrors public.season_label() in the database. Season is never stored: it is
// derived from a job's earliest photo day. December, January and February are
// one Winter, labeled by the January year: Dec 2026 is "Winter 2027".
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
  const year = Number(m[1]);
  const month = Number(m[2]);
  return `${seasonName(month)} ${month === 12 ? year + 1 : year}`;
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

const NAMES: SeasonName[] = ["Winter", "Spring", "Summer", "Fall"];

/** Moves a season label by n seasons: shiftSeason("Fall 2026", 2) is "Spring 2027". */
export function shiftSeason(label: string, n: number): string {
  const [name, yearText] = label.split(" ");
  const index = Number(yearText) * 4 + NAMES.indexOf(name as SeasonName) + n;
  return `${NAMES[((index % 4) + 4) % 4]} ${Math.floor(index / 4)}`;
}

/**
 * The season whose offers go out now. Outreach runs two seasons ahead:
 * spring offers in November (fall), summer in January (winter), fall in
 * March and April (spring), winter in July and August (summer).
 */
export function outreachSeason(todayIso: string): string {
  return shiftSeason(currentSeason(todayIso), 2);
}

/** First and last calendar date of a season label, as "YYYY-MM-DD". */
export function seasonRange(label: string): { start: string; end: string } {
  const [name, yearText] = label.split(" ");
  const y = Number(yearText);
  switch (name as SeasonName) {
    case "Winter": {
      const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
      return { start: `${y - 1}-12-01`, end: `${y}-02-${leap ? 29 : 28}` };
    }
    case "Spring":
      return { start: `${y}-03-01`, end: `${y}-05-31` };
    case "Summer":
      return { start: `${y}-06-01`, end: `${y}-08-31` };
    default:
      return { start: `${y}-09-01`, end: `${y}-11-30` };
  }
}

export function isSeasonLabel(value: unknown): value is string {
  return typeof value === "string" && /^(Winter|Spring|Summer|Fall) \d{4}$/.test(value);
}

/** Last year's photo day moved forward 52 weeks: the same weekday, about a year on. */
export function equivalentDate(lastIso: string): string {
  const d = new Date(`${lastIso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 364);
  return d.toISOString().slice(0, 10);
}
