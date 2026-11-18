// Pure helpers for the scheduler: clock math, a first layout, and export.

export type Slot = {
  id?: string;
  station: number;
  starts_at: string; // "HH:MM" or "HH:MM:SS"
  minutes: number;
  kind: "team" | "break";
  team_id: string | null;
  label: string | null;
};

export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function toClock(total: number): string {
  const m = Math.max(0, Math.min(total, 23 * 60 + 55));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** When each station is next free: the end of its last slot, or the start. */
export function nextFree(slots: Slot[], stations: number, start: string): number[] {
  const free = Array.from({ length: stations }, () => toMinutes(start));
  for (const s of slots) {
    if (s.station < 1 || s.station > stations) continue;
    free[s.station - 1] = Math.max(free[s.station - 1], toMinutes(s.starts_at) + s.minutes);
  }
  return free;
}

/**
 * Places every team that has no slot yet, in the order given, each on the
 * station that is free soonest. Existing slots are left alone. Teams that
 * would run past midnight are left unplaced.
 */
export function placeRemaining(
  teamIds: string[],
  slots: Slot[],
  opts: { stations: number; start: string; block: number },
): Slot[] {
  const placed = new Set(slots.map((s) => s.team_id).filter(Boolean));
  const free = nextFree(slots, opts.stations, opts.start);
  const added: Slot[] = [];
  for (const id of teamIds) {
    if (placed.has(id)) continue;
    let station = 0;
    for (let i = 1; i < free.length; i++) if (free[i] < free[station]) station = i;
    if (free[station] + opts.block > 24 * 60) break;
    added.push({
      station: station + 1,
      starts_at: toClock(free[station]),
      minutes: opts.block,
      kind: "team",
      team_id: id,
      label: null,
    });
    free[station] += opts.block;
    placed.add(id);
  }
  return added;
}

/**
 * Makes room on one station for a new slot (a break) at `start`. Every slot
 * on that station that starts at or after it and would now overlap moves
 * later, just far enough, and pushes the ones behind it the same way. A gap
 * in the schedule absorbs the push, so later slots only move if they must.
 * Returns the moves, or null when one would run past the end of the day.
 */
export function makeRoom(slots: Slot[], station: number, start: string, minutes: number): { id: string; starts_at: string }[] | null {
  const from = toMinutes(start);
  let cursor = from + minutes;
  const moves: { id: string; starts_at: string }[] = [];
  const after = slots
    .filter((s) => s.station === station && toMinutes(s.starts_at) >= from)
    .sort((a, b) => toMinutes(a.starts_at) - toMinutes(b.starts_at));
  for (const s of after) {
    const at = toMinutes(s.starts_at);
    if (at >= cursor) break;
    if (cursor + s.minutes > 24 * 60 || !s.id) return null;
    moves.push({ id: s.id, starts_at: toClock(cursor) });
    cursor += s.minutes;
  }
  return moves;
}

const cell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  // A leading =, +, - or @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export type ExportTeam = { id: string; name: string; division: string | null; coach_name: string | null; tc_number: string | null };

export function scheduleCsv(slots: Slot[], teams: ExportTeam[], date: string): string {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const rows = [...slots]
    .sort((a, b) => toMinutes(a.starts_at) - toMinutes(b.starts_at) || a.station - b.station)
    .map((s) => {
      const t = s.team_id ? byId.get(s.team_id) : undefined;
      return [
        date,
        toClock(toMinutes(s.starts_at)),
        toClock(toMinutes(s.starts_at) + s.minutes),
        s.station,
        s.kind === "break" ? s.label || "Break" : (t?.name ?? s.label ?? ""),
        t?.division,
        t?.coach_name,
        t?.tc_number,
      ]
        .map(cell)
        .join(",");
    });
  return ["Date,Start,End,Station,Team,Division,Coach,TC", ...rows].join("\n") + "\n";
}
