// Pure helpers for the owner home: what needs the owner first, and which
// coming photo days are at risk. Kept free of the database so they can be
// tested.

export type Need = { key: string; title: string; detail: string; href: string; weight: number };

/** The owner home shows at most three things that need the owner. */
export const MAX_NEEDS = 3;

/** The heaviest needs first, never more than three, and none with no weight. */
export function pickNeeds(candidates: Need[], max = MAX_NEEDS): Need[] {
  return candidates
    .filter((c) => c.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key))
    .slice(0, max);
}

export type ReadyRow = { agreement_signed: boolean | null; planning_form: string | null; roster: string | null; schedule: string | null };

/** What a photo day still lacks, in the office's words. */
export function missingFor(r: ReadyRow | undefined): string[] {
  if (!r) return [];
  return [
    !r.agreement_signed && "agreement",
    r.planning_form !== "submitted" && "form",
    (!r.roster || r.roster === "not_received") && "roster",
    r.schedule !== "submitted" && r.schedule !== "complete" && "schedule",
  ].filter((x): x is string => !!x);
}

export type RiskDay = { id: string; jobId: string; name: string; date: string; daysOut: number; missing: string[]; crewOpen: number; noCrew: boolean };

/**
 * How worried to be about one coming photo day: more missing pieces and
 * fewer days left both raise it. Zero means nothing is missing.
 */
export function riskScore(d: Pick<RiskDay, "daysOut" | "missing" | "crewOpen" | "noCrew">): number {
  const gaps = d.missing.length + (d.noCrew ? 1 : 0) + (d.crewOpen > 0 ? 1 : 0);
  if (!gaps) return 0;
  const urgency = d.daysOut <= 3 ? 4 : d.daysOut <= 7 ? 3 : d.daysOut <= 14 ? 2 : 1;
  return gaps * urgency;
}

/** Whole hours between two instants, never negative. */
export function hoursBetween(fromIso: string, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - new Date(fromIso).getTime()) / 3_600_000));
}

/** "3 hours", "2 days": a wait in the largest unit that fits. */
export function waitLabel(hours: number): string {
  if (hours < 1) return "under an hour";
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `${days} days`;
}
