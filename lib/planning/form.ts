import { z } from "zod";

// The planning step of the portal (replaces the Tally form). Answers are
// stored as one JSON object on planning_forms.answers; this is its shape.

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const text = (max: number) => z.preprocess(blank, z.string().trim().max(max).optional());
const count = z.preprocess(blank, z.coerce.number().int().min(0).max(5000).optional());

export const PlanningAnswers = z.object({
  first_group_time: z.preprocess(blank, z.string().regex(/^\d{2}:\d{2}$/).optional()),
  setup: z.preprocess(blank, z.enum(["indoors", "outdoors"]).optional()),
  venue: text(300),
  arrival_notes: text(2000),
  team_count: count,
  athlete_count: count,
  sponsors: text(2000),
  delivery: z.preprocess(blank, z.enum(["club", "home"]).optional()),
  delivery_address: text(500),
  notes: text(2000),
});
export type PlanningAnswers = z.infer<typeof PlanningAnswers>;

/** Reads stored answers, dropping anything that no longer fits the shape. */
export function readAnswers(value: unknown): PlanningAnswers {
  const parsed = PlanningAnswers.safeParse(value ?? {});
  return parsed.success ? parsed.data : {};
}

export const SETUP_LABEL = { indoors: "Indoors", outdoors: "Outdoors" } as const;
export const DELIVERY_CHOICE_LABEL = { club: "Delivered to the league", home: "Mailed to each home" } as const;

/** What the form still needs before it is complete, in plain words. */
export function stillToCome(a: PlanningAnswers): string[] {
  const out: string[] = [];
  if (!a.first_group_time) out.push("start time");
  if (!a.setup) out.push("indoors or outdoors");
  if (!a.venue) out.push("place");
  if (a.team_count === undefined || a.athlete_count === undefined) out.push("group counts");
  if (!a.delivery) out.push("delivery choice");
  if (a.delivery === "club" && !a.delivery_address) out.push("delivery address");
  return out;
}

/** Label and value pairs for showing the answers to the office. */
export function answerRows(a: PlanningAnswers): { label: string; value: string }[] {
  const rows: [string, string | number | undefined][] = [
    ["First group ready", a.first_group_time],
    ["Setup", a.setup && SETUP_LABEL[a.setup]],
    ["Place", a.venue],
    ["Finding us on the day", a.arrival_notes],
    ["Teams or groups", a.team_count],
    ["Athletes", a.athlete_count],
    ["Sponsors", a.sponsors],
    ["Delivery", a.delivery && DELIVERY_CHOICE_LABEL[a.delivery]],
    ["Delivery address", a.delivery_address],
    ["Anything else", a.notes],
  ];
  return rows.filter(([, v]) => v !== undefined && v !== "").map(([label, v]) => ({ label, value: String(v) }));
}

/** Half-hour choices for the first group, 6:00 AM to 9:00 PM. */
export function timeChoices(): string[] {
  const out: string[] = [];
  for (let m = 6 * 60; m <= 21 * 60; m += 30) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}
