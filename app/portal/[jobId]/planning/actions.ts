"use server";

import { revalidatePath } from "next/cache";
import { PlanningAnswers } from "@/lib/planning/form";
import { portalJob } from "@/lib/portal/job";

export type PlanningState = { ok: boolean; message: string } | null;

// The database decides who may save (this job's coordinator after signing,
// or the office). Saving keeps a draft; sending marks the form submitted.
export async function savePlanning(jobId: string, _prev: PlanningState, form: FormData): Promise<PlanningState> {
  const ctx = await portalJob(jobId);
  if (!ctx) return { ok: false, message: "This page is out of date. Reload it and try again." };

  const raw: Record<string, unknown> = {};
  for (const key of Object.keys(PlanningAnswers.shape)) {
    const v = form.get(key);
    if (typeof v === "string") raw[key] = v;
  }
  const parsed = PlanningAnswers.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "One of the answers is not in a form we can read. Check the numbers and try again." };
  }
  const submit = form.get("intent") === "send";
  const { error } = await ctx.supabase.rpc("save_planning_form", {
    p_job_id: jobId,
    p_answers: parsed.data,
    p_submit: submit,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/portal/${jobId}`);
  revalidatePath(`/portal/${jobId}/planning`);
  return { ok: true, message: submit ? "Sent. Thank you. You can still come back and change an answer." : "Saved." };
}
