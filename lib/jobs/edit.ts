import { z } from "zod";
import type { Database } from "@/lib/database.types";

// What the office may change by hand on a job and on a photo day, and the
// rules each value must pass. The forms and the actions both read from here.

type JobStatus = Database["public"]["Enums"]["job_status"];

/** Statuses that are set by hand. Held and Released belong to the date hold. */
export const HAND_STATUSES = ["planning", "in_production", "at_lab", "delivered", "complete", "archived", "cancelled"] as const satisfies readonly JobStatus[];
/** A held or released job changes status on the Season board, with its hold. */
export const HOLD_STATUSES: readonly JobStatus[] = ["held", "released"];

export const LABS = ["alkit", "marco", "skylab"] as const;
export const LAB_LABEL: Record<(typeof LABS)[number], string> = { alkit: "Alkit", marco: "Marco", skylab: "Skylab" };
export const JOB_TYPES = ["photo_day", "event"] as const;
export const JOB_TYPE_LABEL: Record<(typeof JOB_TYPES)[number], string> = { photo_day: "Photo day", event: "Event" };
export const PROGRAMS = ["sports", "swim"] as const;
export const PROGRAM_LABEL: Record<(typeof PROGRAMS)[number], string> = { sports: "Sports", swim: "Swim" };
export const VENUES = ["on_location", "studio"] as const;
export const VENUE_LABEL: Record<(typeof VENUES)[number], string> = { on_location: "On location", studio: "Studio" };
export const SALE_MODES = ["prepay", "proofing"] as const;
export const SALE_MODE_LABEL: Record<(typeof SALE_MODES)[number], string> = { prepay: "Prepay", proofing: "Proofing" };
export const TEAM_PHOTO_TYPES = ["composite", "traditional"] as const;
export const TEAM_PHOTO_LABEL: Record<(typeof TEAM_PHOTO_TYPES)[number], string> = { composite: "Composite", traditional: "Traditional" };
export const DELIVERY_METHODS = ["league_delivery", "mailer"] as const;
export const STAGE_VALUES = ["import", "editing", "upload", "composites", "gallery_prep", "qa_marketing", "complete"] as const;

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const text = (max: number) => z.preprocess(blank, z.string().trim().max(max).nullable());
const pick = <T extends readonly [string, ...string[]]>(values: T) => z.preprocess(blank, z.enum(values).nullable());
const count = (max: number) => z.preprocess(blank, z.coerce.number().int().min(0).max(max).nullable());
const yesNo = z.preprocess((v) => (v === "yes" ? true : v === "no" ? false : null), z.boolean().nullable());

const JobEdit = z.object({
  name: z.string().trim().min(1).max(200),
  org_id: z.preprocess(blank, z.uuid().nullable()),
  status: z.enum([...HAND_STATUSES, "held", "released"]),
  production_stage: pick(STAGE_VALUES).optional(),
  lab: pick(LABS),
  job_type: z.enum(JOB_TYPES),
  program: z.enum(PROGRAMS),
  venue: z.enum(VENUES),
  sale_mode: z.enum(SALE_MODES),
  sports: z.preprocess(
    (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : []),
    z.array(z.string().max(60)).max(10),
  ),
  expected_teams: count(2000),
  expected_subjects: count(20000),
  delivery_method: pick(DELIVERY_METHODS),
  team_photo_type: pick(TEAM_PHOTO_TYPES),
  sponsors: yesNo,
  promo: text(200),
  coupon: z.preprocess(blank, z.string().trim().max(40).regex(/^[A-Za-z0-9_-]*$/).nullable()),
});
export type JobEditValues = z.infer<typeof JobEdit>;

export type Parsed<T> = { ok: true; values: T } | { ok: false; message: string };

const JOB_FIELD: Record<string, string> = {
  name: "The job needs a name, up to 200 characters.",
  expected_teams: "Teams is a whole number, 0 or more.",
  expected_subjects: "Players is a whole number, 0 or more.",
  coupon: "A coupon code is letters and numbers only, up to 40.",
  sports: "List up to 10 sports, separated by commas.",
  promo: "The promo holds up to 200 characters.",
};

/**
 * Reads the job details form. `current` is the job's status now: a held or
 * released job keeps its status here, and no other job can be put there.
 */
export function parseJobEdit(input: Record<string, unknown>, current: JobStatus): Parsed<JobEditValues> {
  const parsed = JobEdit.safeParse(input);
  if (!parsed.success) {
    const key = String(parsed.error.issues[0]?.path[0] ?? "");
    return { ok: false, message: JOB_FIELD[key] ?? "One of the details could not be read. Check the form and try again." };
  }
  const v = parsed.data;
  const holdNow = HOLD_STATUSES.includes(current);
  if (v.status !== current && (holdNow || HOLD_STATUSES.includes(v.status))) {
    return { ok: false, message: "A held or released date changes on the Season board, where its hold is confirmed or released." };
  }
  return { ok: true, values: { ...v, coupon: v.coupon ? v.coupon.toUpperCase() : null } };
}

const clock = z.preprocess(
  (v) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim().slice(0, 5)) : v),
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
);

const DayEdit = z.object({
  label: text(120),
  start_time: clock,
  end_time: clock,
  location_name: text(200),
  address: text(200),
  city: text(100),
  state: text(40),
  zip: z.preprocess(blank, z.string().trim().max(10).regex(/^[0-9A-Za-z -]*$/).nullable()),
  location_details: text(1000),
  indoor: z.preprocess((v) => (v === "indoor" ? true : v === "outdoor" ? false : null), z.boolean().nullable()),
  alt_indoor_location: text(200),
  stations: z.coerce.number().int().min(1).max(20),
  notes: text(2000),
});
export type DayEditValues = z.infer<typeof DayEdit>;

const DAY_FIELD: Record<string, string> = {
  start_time: "The start time could not be read.",
  end_time: "The end time could not be read.",
  stations: "Stations are 1 to 20.",
  zip: "The ZIP code could not be read.",
};

/** Reads the photo day form. The date and status are not here: they move through Change date. */
export function parseDayEdit(input: Record<string, unknown>): Parsed<DayEditValues> {
  const parsed = DayEdit.safeParse(input);
  if (!parsed.success) {
    const key = String(parsed.error.issues[0]?.path[0] ?? "");
    return { ok: false, message: DAY_FIELD[key] ?? "One of the details is too long or could not be read." };
  }
  const v = parsed.data;
  if (v.start_time && v.end_time && v.end_time <= v.start_time) {
    return { ok: false, message: "The end time has to be after the start time." };
  }
  return { ok: true, values: v };
}

const url = z.preprocess(
  blank,
  z.string().trim().max(500).refine((s) => /^https:\/\/[^\s]+$/.test(s), "url").nullable(),
);
const LinksEdit = z.object({
  captura_gallery_id: z.preprocess(blank, z.coerce.number().int().min(1).max(2_000_000_000).nullable()),
  online_shop_url: url,
  drive_folder_url: url,
});
export type LinksEditValues = z.infer<typeof LinksEdit>;

export function parseLinksEdit(input: Record<string, unknown>): Parsed<LinksEditValues> {
  const parsed = LinksEdit.safeParse(input);
  if (!parsed.success) {
    const key = String(parsed.error.issues[0]?.path[0] ?? "");
    return {
      ok: false,
      message: key === "captura_gallery_id" ? "The Captura gallery is its number, such as 123456." : "A link starts with https:// and has no spaces.",
    };
  }
  return { ok: true, values: parsed.data };
}
