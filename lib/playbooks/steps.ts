import { z } from "zod";
import { CAPTURA_TAG } from "@/lib/captura/setup";

// Playbook steps are rows an owner or admin edits in Settings. These helpers
// turn the edit form into a row and describe a step's timing in plain words.

const blank = (v: unknown) => (v == null || (typeof v === "string" && v.trim() === "") ? undefined : v);

export const StepForm = z.object({
  name: z.string().trim().min(1).max(200),
  stage: z.preprocess(blank, z.string().trim().max(60).optional()),
  owner_hint: z.preprocess(blank, z.string().trim().max(120).optional()),
  description: z.preprocess(blank, z.string().trim().max(2000).optional()),
  // Days from the first photo day. Empty means the step has no due date.
  days: z.preprocess(blank, z.coerce.number().int().min(0).max(365).optional()),
  when: z.enum(["before", "after"]),
  captura: z.boolean(),
  active: z.boolean(),
});
export type StepFormValues = z.infer<typeof StepForm>;

export function readStepForm(form: FormData) {
  return StepForm.safeParse({
    name: form.get("name"),
    stage: form.get("stage"),
    owner_hint: form.get("owner_hint"),
    description: form.get("description"),
    days: form.get("days"),
    when: form.get("when") ?? "before",
    captura: form.get("captura") === "on",
    active: form.get("active") === "on",
  });
}

export function offsetDays(v: Pick<StepFormValues, "days" | "when">): number | null {
  if (v.days == null) return null;
  return v.when === "before" ? -v.days : v.days;
}

// Kept in the same shape the imported steps use: "-45d", "+3d", "none".
export function offsetText(days: number | null): string {
  if (days == null) return "none";
  return `${days > 0 ? "+" : ""}${days}d`;
}

export function timingLabel(days: number | null): string {
  if (days == null) return "No due date";
  if (days === 0) return "On photo day";
  const n = Math.abs(days);
  return `${n} ${n === 1 ? "day" : "days"} ${days < 0 ? "before" : "after"} photo day`;
}

// The Captura tag is the only tag the form owns; any other tag is kept.
export function withCapturaTag(tags: string[], captura: boolean): string[] {
  const rest = tags.filter((t) => t !== CAPTURA_TAG);
  return captura ? [...rest, CAPTURA_TAG] : rest;
}

export function stepRow(v: StepFormValues, existingTags: string[] = []) {
  const days = offsetDays(v);
  return {
    name: v.name,
    stage: v.stage ?? null,
    owner_hint: v.owner_hint ?? null,
    description: v.description ?? null,
    offset_days: days,
    offset_text: offsetText(days),
    tags: withCapturaTag(existingTags, v.captura),
    active: v.active,
  };
}

// Moving a step swaps its place with the neighbour above or below.
export function neighbour<T extends { id: string }>(ordered: T[], id: string, direction: "up" | "down"): T | null {
  const i = ordered.findIndex((s) => s.id === id);
  if (i < 0) return null;
  return ordered[direction === "up" ? i - 1 : i + 1] ?? null;
}
