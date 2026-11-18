"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { seasonForDate } from "@/lib/season";

export type NewJobState = { ok: boolean; message: string } | null;

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opt = (max: number) => z.preprocess(blank, z.string().trim().max(max).optional());
const time = z.preprocess(blank, z.string().regex(/^\d{2}:\d{2}$/).optional());

const Job = z.object({
  org_id: z.uuid(),
  name: opt(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: time,
  end_time: time,
  location_name: opt(200),
  city: opt(100),
  state: opt(40),
  stations: z.coerce.number().int().min(1).max(20),
  expected_subjects: z.preprocess(blank, z.coerce.number().int().min(0).max(20000).optional()),
});

// A job added by hand is a booked photo day in planning: no hold and no
// offer. (Held dates come from the Season board.) Writes run as the
// signed-in person, so RLS decides (office roles only).
export async function createJob(_prev: NewJobState, form: FormData): Promise<NewJobState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  const parsed = Job.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) return { ok: false, message: "Pick a league and a photo day date. Stations are 1 to 20." };
  const d = parsed.data;

  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("id, name, sports").eq("id", d.org_id).maybeSingle();
  if (!org) return { ok: false, message: "That league was not found." };

  const { data: job, error } = await supabase
    .from("jobs")
    .insert({
      company_id: viewer.companyId,
      org_id: org.id,
      name: d.name ?? `${org.name} ${seasonForDate(d.date) ?? ""}`.trim(),
      status: "planning",
      sports: org.sports ?? [],
      expected_subjects: d.expected_subjects ?? null,
    })
    .select("id")
    .single();
  if (error || !job) return { ok: false, message: "The job could not be added." };

  const { error: dayError } = await supabase.from("photo_days").insert({
    company_id: viewer.companyId,
    job_id: job.id,
    date: d.date,
    start_time: d.start_time ?? null,
    end_time: d.end_time ?? null,
    location_name: d.location_name ?? null,
    city: d.city ?? null,
    state: d.state ?? null,
    stations: d.stations,
  });
  if (dayError) {
    await supabase.from("jobs").delete().eq("id", job.id);
    return { ok: false, message: "The photo day could not be added, so the job was not created." };
  }

  // The league's main contact becomes the job's coordinator contact.
  const { data: primary } = await supabase
    .from("organization_contacts")
    .select("contact_id")
    .eq("org_id", org.id)
    .is("ended_on", null)
    .order("is_primary", { ascending: false })
    .limit(1);
  if (primary?.[0]) {
    await supabase.from("job_contacts").insert({ job_id: job.id, contact_id: primary[0].contact_id, company_id: viewer.companyId, role: "coordinator" });
  }

  revalidatePath("/jobs");
  redirect(`/jobs/${job.id}`);
}
