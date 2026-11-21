"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Production board actions, written as the signed-in person. The database
// works the job's stage out from its tasks; nothing here sets a stage.

function refresh(jobId: string) {
  revalidatePath("/production");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/tasks");
  revalidatePath("/");
}

export async function startProduction(jobId: string) {
  await requireStaff(OFFICE_ROLES);
  if (!z.uuid().safeParse(jobId).success) return;
  const supabase = await createClient();
  await supabase.rpc("start_production", { p_job: jobId });
  refresh(jobId);
}

export async function finishTask(jobId: string, taskId: string) {
  const viewer = await requireStaff(OFFICE_ROLES);
  if (!z.uuid().safeParse(jobId).success || !z.uuid().safeParse(taskId).success) return;
  const supabase = await createClient();
  await supabase
    .from("tasks")
    .update({ status: "done", completed_at: new Date().toISOString(), completed_by: viewer.id })
    .eq("id", taskId)
    .eq("job_id", jobId);
  refresh(jobId);
}

/** The lab's work for the job has been delivered. Only a job at the lab moves. */
export async function markDelivered(jobId: string) {
  await requireStaff(OFFICE_ROLES);
  if (!z.uuid().safeParse(jobId).success) return;
  const supabase = await createClient();
  await supabase.from("jobs").update({ status: "delivered" }).eq("id", jobId).eq("status", "at_lab");
  refresh(jobId);
}
