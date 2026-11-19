"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, OFFICE_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CAPTURA_TAG, stepDueOn } from "@/lib/captura/setup";

// Ticking a Captura setup step records it as a task on the job, so the same
// work shows on the task list. Nothing here talks to Captura.
export async function setSetupStep(jobId: string, stepId: string, done: boolean) {
  const viewer = await requireStaff(OFFICE_ROLES);
  if (!viewer.companyId || !z.uuid().safeParse(jobId).success || !z.uuid().safeParse(stepId).success) return;
  const supabase = await createClient();

  const [{ data: step }, { data: existing }, { data: day }] = await Promise.all([
    supabase.from("playbook_steps").select("id, name, offset_days, tags").eq("id", stepId).eq("active", true).maybeSingle(),
    supabase.from("tasks").select("id").eq("job_id", jobId).eq("playbook_step_id", stepId).order("created_at").limit(1).maybeSingle(),
    supabase.from("photo_days").select("date").eq("job_id", jobId).eq("status", "scheduled").order("date").limit(1).maybeSingle(),
  ]);
  if (!step || !step.tags.includes(CAPTURA_TAG)) return;

  const closed = { status: done ? ("done" as const) : ("todo" as const), completed_at: done ? new Date().toISOString() : null, completed_by: done ? viewer.id : null };
  if (existing) {
    await supabase.from("tasks").update(closed).eq("id", existing.id);
  } else {
    await supabase.from("tasks").insert({
      company_id: viewer.companyId,
      job_id: jobId,
      playbook_step_id: stepId,
      title: step.name,
      due_on: stepDueOn(day?.date, step.offset_days),
      created_by: viewer.id,
      ...closed,
    });
  }
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/tasks");
}

export type CouponState = { ok: boolean; message: string } | null;

const Coupon = z.string().trim().max(40).regex(/^[A-Za-z0-9_-]*$/);

export async function saveCoupon(jobId: string, _prev: CouponState, form: FormData): Promise<CouponState> {
  await requireStaff(OFFICE_ROLES);
  const coupon = Coupon.safeParse(form.get("coupon") ?? "");
  if (!z.uuid().safeParse(jobId).success || !coupon.success) {
    return { ok: false, message: "A coupon code is letters and numbers only, up to 40." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("jobs").update({ coupon: coupon.data.toUpperCase() || null }).eq("id", jobId);
  if (error) return { ok: false, message: "The coupon code could not be saved." };
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true, message: "Saved." };
}
