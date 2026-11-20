"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type AddDayState = { ok: boolean; message: string } | null;

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opt = (max: number) => z.preprocess(blank, z.string().trim().max(max).optional());
const time = z.preprocess(blank, z.string().regex(/^\d{2}:\d{2}$/).optional());

const Day = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: opt(120),
  start_time: time,
  end_time: time,
  location_name: opt(200),
  address: opt(200),
  city: opt(100),
  state: opt(40),
  stations: z.coerce.number().int().min(1).max(20),
});

/**
 * Adds another photo day to a job that is already open. One league's season
 * is one job, so a second night or a second field is a day here, not a new
 * job. Writes run as the signed-in person, so RLS decides (office roles only).
 */
export async function addPhotoDay(jobId: string, _prev: AddDayState, form: FormData): Promise<AddDayState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  const id = z.uuid().safeParse(jobId);
  const parsed = Day.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  if (!id.success || !parsed.success) return { ok: false, message: "Pick a date. Stations are 1 to 20." };
  const d = parsed.data;

  const supabase = await createClient();
  const { data: job } = await supabase.from("jobs").select("id, status").eq("id", id.data).maybeSingle();
  if (!job) return { ok: false, message: "That job was not found." };
  if (["cancelled", "released"].includes(job.status)) return { ok: false, message: "This job is closed, so a photo day cannot be added to it." };

  const { error } = await supabase.from("photo_days").insert({
    company_id: viewer.companyId,
    job_id: job.id,
    date: d.date,
    label: d.label ?? null,
    start_time: d.start_time ?? null,
    end_time: d.end_time ?? null,
    location_name: d.location_name ?? null,
    address: d.address ?? null,
    city: d.city ?? null,
    state: d.state ?? null,
    stations: d.stations,
  });
  if (error) return { ok: false, message: "The photo day could not be added." };

  revalidatePath(`/jobs/${job.id}`);
  revalidatePath("/jobs");
  return { ok: true, message: "Photo day added." };
}
