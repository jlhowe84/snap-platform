// Staffing rules with no database, so they can be tested on their own.

export const SHIFT_POSITIONS = ["photographer", "poser", "coordinator", "photo_attendant"] as const;
export type ShiftPosition = (typeof SHIFT_POSITIONS)[number];

export const POSITION_LABEL: Record<string, string> = {
  photographer: "Photographer",
  poser: "Poser",
  coordinator: "Coordinator",
  photo_attendant: "Photo attendant",
  office: "Office",
};

export const SHIFT_STATUSES = ["draft", "open", "filled", "cancelled"] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

export const SHIFT_STATUS_LABEL: Record<ShiftStatus, string> = {
  draft: "Not published",
  open: "Open",
  filled: "Filled",
  cancelled: "Cancelled",
};

export function isPosition(v: unknown): v is ShiftPosition {
  return typeof v === "string" && (SHIFT_POSITIONS as readonly string[]).includes(v);
}

export type PlannedShift = { position: ShiftPosition; station: number | null };

/**
 * The shifts a photo day needs. Photographers, posers and attendants are per
 * station (numbered 1 to n); coordinators cover the whole day.
 */
export function planShifts(counts: Record<ShiftPosition, number>, stations: number): PlannedShift[] {
  const out: PlannedShift[] = [];
  for (const position of SHIFT_POSITIONS) {
    const n = Math.max(0, Math.min(40, Math.floor(counts[position] ?? 0)));
    for (let i = 0; i < n; i++) {
      const perStation = position !== "coordinator" && n === stations;
      out.push({ position, station: perStation ? i + 1 : null });
    }
  }
  return out;
}

/** The starting counts for a day with this many stations. */
export function defaultCounts(stations: number): Record<ShiftPosition, number> {
  return { photographer: stations, poser: stations, coordinator: 1, photo_attendant: 0 };
}

/** The Level the next wave opens to; null means everyone. Level 1 is asked first. */
export function nextWave(openLevel: number | null): number | null {
  if (openLevel == null) return null;
  return openLevel >= 5 ? null : openLevel + 1;
}

export function waveLabel(status: ShiftStatus, openLevel: number | null): string {
  if (status !== "open") return SHIFT_STATUS_LABEL[status];
  if (openLevel == null) return "Open to everyone";
  return openLevel === 1 ? "Open to Level 1" : `Open to Levels 1 to ${openLevel}`;
}

export type CrewChoice = {
  id: string;
  full_name: string;
  positions: string[];
  level: number | null;
  active: boolean;
};

/**
 * Who the office can put on a shift: active crew who work that position, Level
 * 1 first, with a note when they already hold a shift on that photo day.
 */
export function crewForShift(
  crew: CrewChoice[],
  position: string,
  busyOnDay: Set<string>,
): (CrewChoice & { busy: boolean })[] {
  return crew
    .filter((c) => c.active && c.positions.includes(position))
    .map((c) => ({ ...c, busy: busyOnDay.has(c.id) }))
    .sort((a, b) => Number(a.busy) - Number(b.busy) || (a.level ?? 9) - (b.level ?? 9) || a.full_name.localeCompare(b.full_name));
}

export type ShiftCount = { status: ShiftStatus };

export function staffingSummary(shifts: ShiftCount[]) {
  const live = shifts.filter((s) => s.status !== "cancelled");
  const filled = live.filter((s) => s.status === "filled").length;
  const drafts = live.filter((s) => s.status === "draft").length;
  return { total: live.length, filled, open: live.length - filled - drafts, drafts };
}

/** What a crew member's answer means, in words for their phone. */
export function responseMessage(result: string): { ok: boolean; message: string } {
  switch (result) {
    case "accepted":
      return { ok: true, message: "It's yours. It is on your schedule below." };
    case "declined":
      return { ok: true, message: "Got it. That shift is off your list." };
    case "already_yours":
      return { ok: true, message: "That shift is already yours." };
    case "conflict":
      return { ok: false, message: "You already have a shift at that time that day." };
    default:
      return { ok: false, message: "Someone else took that shift, or it is no longer open." };
  }
}
