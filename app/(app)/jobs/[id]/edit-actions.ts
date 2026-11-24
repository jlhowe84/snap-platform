"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseDayEdit, parseJobEdit, parseLinksEdit } from "@/lib/jobs/edit";

export type EditState = { ok: boolean; message: string } | null;

const fields = (form: FormData) => Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));

function refresh(jobId: string) {
  revalidatePath(`/jobs/${jobId}`);
  for (const p of ["/", "/jobs", "/production", "/season", "/staffing", "/owner"]) revalidatePath(p);
}

// The office changes a job's details by hand. Writes run as the signed-in
// person, so RLS decides who may, and the change lands in the audit log.
export async function saveJobDetails(jobId: string, _prev: EditState, form: FormData): Promise<EditState> {
  await requireStaff(OFFICE_ROLES);
  if (!z.uuid().safeParse(jobId).success) return { ok: false, message: "That job was not found." };
  const supabase = await createClient();
  const { data: job } = await supabase.from("jobs").select("status, production_started_at").eq("id", jobId).maybeSingle();
  if (!job) return { ok: false, message: "That job was not found." };

  const parsed = parseJobEdit(fields(form), job.status);
  if (!parsed.ok) return parsed;
  const { production_stage, ...values } = parsed.values;

  // The stage follows the production tasks once the platform has given the
  // job its tasks. Before that it can be set by hand.
  const stage = !job.production_started_at && production_stage !== undefined ? { production_stage } : {};
  const { data, error } = await supabase.from("jobs").update({ ...values, ...stage }).eq("id", jobId).select("id");
  if (error || !data?.length) return { ok: false, message: "The details could not be saved." };
  refresh(jobId);
  return { ok: true, message: "Job details saved." };
}

// Times, place and stations of one photo day. The date and whether the day
// is on stay with Change date, which runs the notices and the reminders.
export async function savePhotoDay(jobId: string, photoDayId: string, _prev: EditState, form: FormData): Promise<EditState> {
  await requireStaff(OFFICE_ROLES);
  if (!z.uuid().safeParse(jobId).success || !z.uuid().safeParse(photoDayId).success) return { ok: false, message: "That photo day was not found." };
  const parsed = parseDayEdit(fields(form));
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const { data, error } = await supabase.from("photo_days").update(parsed.values).eq("id", photoDayId).eq("job_id", jobId).select("id");
  if (error || !data?.length) return { ok: false, message: "The photo day could not be saved." };
  refresh(jobId);
  revalidatePath(`/staffing/${photoDayId}`);
  revalidatePath(`/field/${photoDayId}`);
  return { ok: true, message: "Photo day saved." };
}

export async function saveJobLinks(jobId: string, _prev: EditState, form: FormData): Promise<EditState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  if (!viewer.companyId || !z.uuid().safeParse(jobId).success) return { ok: false, message: "That job was not found." };
  const parsed = parseLinksEdit(fields(form));
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const { error } = await supabase
    .from("job_links")
    .upsert({ job_id: jobId, company_id: viewer.companyId, ...parsed.values }, { onConflict: "job_id" });
  if (error) return { ok: false, message: "The links could not be saved." };
  refresh(jobId);
  revalidatePath("/orders");
  return { ok: true, message: "Links saved." };
}
