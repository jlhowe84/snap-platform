"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type TestSetState = { ok: boolean; message: string } | null;

/** Starts a run of every active case. The page then works it a batch at a time. */
export async function startRun(): Promise<{ ok: true; runId: string } | { ok: false; message: string }> {
  const viewer = await requireStaff(ADMIN_ROLES);
  const { startEvalRun } = await import("@/lib/evals/run");
  return startEvalRun(viewer);
}

export async function runBatch(runId: string) {
  const viewer = await requireStaff(ADMIN_ROLES);
  const { runEvalBatch } = await import("@/lib/evals/run");
  const result = await runEvalBatch(viewer, z.uuid().parse(runId));
  if (!result.ok || result.done) revalidatePath("/settings/test-set");
  return result;
}

export async function setCaseActive(id: string, active: boolean) {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();
  await supabase.from("eval_cases").update({ active }).eq("id", z.uuid().parse(id));
  revalidatePath("/settings/test-set");
}

/** Copies a support conversation into the test set, with our latest reply as the answer. */
export async function addConversationToTestSet(conversationId: string): Promise<TestSetState> {
  await requireStaff(ADMIN_ROLES);
  const id = z.uuid().safeParse(conversationId);
  if (!id.success) return { ok: false, message: "That conversation was not found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_eval_case_from_conversation", { p_conversation: id.data });
  if (error) return { ok: false, message: error.message.replace(/^.*?: /, "") };
  revalidatePath("/settings/test-set");
  return { ok: true, message: "Added to the test set. Our latest reply is kept as the right answer." };
}
