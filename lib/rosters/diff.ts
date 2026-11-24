import { z } from "zod";

// What import_standard_roster() records on a roster version when an earlier
// finished roster exists: differences by team. Team names and head counts
// only; no child's name is in it.

const team = z.object({ name: z.string(), division: z.string().nullable().optional(), players: z.number().nullable().optional() });
const schema = z.object({
  from_version: z.number(),
  players: z.object({ from: z.number().nullable(), to: z.number().nullable() }),
  teams: z.object({ from: z.number().nullable(), to: z.number().nullable() }),
  added: z.array(team),
  removed: z.array(team.extend({ kept: z.boolean() })),
  changed: z.array(z.object({ name: z.string(), division: z.string().nullable().optional(), from: z.number().nullable(), to: z.number().nullable() })),
});
export type RosterDiff = z.infer<typeof schema>;

export function readRosterDiff(value: unknown): RosterDiff | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function diffIsEmpty(d: RosterDiff): boolean {
  return !d.added.length && !d.removed.length && !d.changed.length && d.players.from === d.players.to;
}

/** Share of the expected number the roster is off by, or null when either is unknown. */
export function offBy(expected: number | null | undefined, actual: number | null | undefined): number | null {
  if (!expected || actual == null) return null;
  return Math.abs(actual - expected) / expected;
}

/** A roster count this far from what the league told us is worth a second look. */
export const COUNT_TOLERANCE = 0.15;
