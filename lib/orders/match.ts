// Which jobs a Captura gallery most likely belongs to. Pure. A league has one
// job per season and often one per photo day, all with the same name, so the
// picker needs the photo day beside the name and the likely ones first.

export type JobChoice = { id: string; name: string; firstDay: string | null };

const NOISE = new Set(["and", "the", "of", "to", "for", "club", "association", "assoc", "league", "youth", "inc", "team", "a"]);

/** The words of a name that tell leagues apart, lower case, years dropped. */
export function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !/^\d{4}$/.test(w) && !NOISE.has(w));
}

/** The four-digit year a gallery title starts with or holds, if any. */
export function titleYear(title: string): number | null {
  const m = /\b(20\d{2})\b/.exec(title);
  return m ? Number(m[1]) : null;
}

/** First letters of a title's words, years and "and" left out: "QFCA". */
export function acronym(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !/^\d{2,4}$/.test(w) && w !== "and")
    .map((w) => w[0])
    .join("");
}

const daysApart = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

/**
 * Jobs that look like this gallery's, best first: most of the job's name
 * words are in the gallery title, and the photo day is near the gallery's
 * orders (prepay orders start before the day, gallery orders follow it).
 */
export function likelyJobs(gallery: { title: string; firstOrder: string | null; lastOrder: string | null }, jobs: JobChoice[], limit = 6): JobChoice[] {
  const words = new Set(nameWords(gallery.title));
  if (!words.size) return [];
  const year = titleYear(gallery.title);
  const short = acronym(gallery.title);
  const scored: { job: JobChoice; share: number; gap: number }[] = [];
  for (const job of jobs) {
    const own = nameWords(job.name);
    if (!own.length) continue;
    const hit = own.filter((w) => words.has(w)).length;
    // A job named by its initials ("QFCA") matches the spelled-out gallery.
    const initials = short.length >= 3 && own.includes(short);
    const share = initials ? 0.9 : hit / Math.max(own.length, words.size);
    if (!initials && (hit < Math.min(2, own.length) || share < 0.5)) continue;
    if (!job.firstDay) continue;
    if (year && Number(job.firstDay.slice(0, 4)) !== year) continue;
    // Orders run from about six weeks before the photo day to months after.
    const from = gallery.firstOrder ?? gallery.lastOrder;
    const gap = from ? daysApart(job.firstDay, from) : 0;
    if (from && gap > 120) continue;
    scored.push({ job, share, gap });
  }
  return scored
    .sort((a, b) => b.share - a.share || a.gap - b.gap || a.job.name.localeCompare(b.job.name))
    .slice(0, limit)
    .map((s) => s.job);
}

export type LinkOption = { id: string; label: string };

/**
 * Picker options for the likely jobs. Photo days of one league are often kept
 * as separate jobs with one name and one gallery, so jobs sharing a name also
 * get one option that links them all (its id is the job ids joined by commas).
 */
export function likelyOptions(likely: JobChoice[], formatDay: (iso: string) => string): LinkOption[] {
  const one = (j: JobChoice) => ({ id: j.id, label: `${j.name} · ${j.firstDay ? formatDay(j.firstDay) : "no photo day yet"}` });
  const out: LinkOption[] = [];
  const seen = new Set<string>();
  for (const j of likely) {
    if (seen.has(j.name)) continue;
    seen.add(j.name);
    const same = likely.filter((x) => x.name === j.name).sort((a, b) => (a.firstDay ?? "").localeCompare(b.firstDay ?? ""));
    if (same.length > 1) {
      const days = same.map((x) => x.firstDay).filter((d): d is string => !!d);
      out.push({ id: same.map((x) => x.id).join(","), label: `${j.name} · all ${same.length} photo days (${formatDay(days[0])} to ${formatDay(days[days.length - 1])})` });
    }
    out.push(...same.map(one));
  }
  return out;
}
