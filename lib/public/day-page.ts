// The public photo day page: shapes and small rules, no network.

export type PublicDay = {
  id: string;
  date: string;
  status: "scheduled" | "postponed" | "cancelled";
  label: string | null;
  start_time: string | null;
  end_time: string | null;
  location_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  location_details: string | null;
  indoor: boolean | null;
  alt_indoor_location: string | null;
  /** Null until the league submits the schedule (or the office hides times). */
  teams: { team: string; division: string | null; time: string }[] | null;
};

export type PublicDayPage = {
  company: { name: string; slug: string } | null;
  league: string | null;
  job: string;
  sports: string[];
  coupon: string | null;
  shop_url: string | null;
  what_to_wear: string | null;
  what_to_bring: string | null;
  note: string | null;
  days: PublicDay[];
};

/** A readable, unguessable slug: the name's words plus five random characters. */
export function makeSlug(name: string, random: () => number = Math.random): string {
  const words = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let tail = "";
  for (let i = 0; i < 5; i++) tail += alphabet[Math.floor(random() * alphabet.length) % alphabet.length];
  return words ? `${words}-${tail}` : `photo-day-${tail}`;
}

/** The one-line address for a day, or null when none is on file. */
export function placeLine(d: Pick<PublicDay, "address" | "city" | "state" | "zip">): string | null {
  const cityState = [d.city, [d.state, d.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const line = [d.address, cityState].filter(Boolean).join(", ");
  return line || null;
}

/** A maps search link for the place, or null when there is nothing to search. */
export function mapsHref(d: Pick<PublicDay, "location_name" | "address" | "city" | "state" | "zip">): string | null {
  const q = [d.location_name, placeLine(d)].filter(Boolean).join(", ");
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

/** Only http(s) links are shown as the prepay button. */
export function safeShopUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Teams grouped by start time, for the lookup. Filter matches team or division. */
export function teamTimes(teams: NonNullable<PublicDay["teams"]>, filter = ""): { time: string; teams: string[] }[] {
  const q = filter.trim().toLowerCase();
  const byTime = new Map<string, string[]>();
  for (const t of teams) {
    const name = t.division ? `${t.team} (${t.division})` : t.team;
    if (q && !name.toLowerCase().includes(q)) continue;
    const key = t.time.slice(0, 5);
    byTime.set(key, [...(byTime.get(key) ?? []), name]);
  }
  return [...byTime.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([time, names]) => ({ time, teams: names }));
}

export const DAY_STATUS_NOTE: Record<PublicDay["status"], string | null> = {
  scheduled: null,
  postponed: "Postponed. A new date will be posted here.",
  cancelled: "Cancelled.",
};
