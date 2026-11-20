"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type CombineState = { ok: boolean; message: string } | null;

const Input = z.object({ keep: z.uuid(), other: z.uuid(), sure: z.literal("on") });

// What the database says when it refuses, in the office's words.
const REASONS: [string, string][] = [
  ["planning of its own", "That job has planning of its own (an agreement, a form, rosters, a schedule or portal links). Open that job and combine this one into it instead."],
  ["same league", "Both jobs must belong to the same league."],
  ["not cancelled", "This job is cancelled. Open the other job and combine this one into it instead."],
];

/**
 * Folds another job of the same league into this one: its photo days, crew,
 * tasks, contacts and links move here and the emptied job is removed. It
 * cannot be undone, so the form carries a tick box.
 */
export async function combineJobs(_prev: CombineState, form: FormData): Promise<CombineState> {
  await requireStaff(OFFICE_ROLES);
  const parsed = Input.safeParse({ keep: form.get("keep"), other: form.get("other"), sure: form.get("sure") });
  if (!parsed.success) return { ok: false, message: "Pick the job to bring in and tick the box." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("combine_jobs", { p_keep: parsed.data.keep, p_other: parsed.data.other });
  if (error) {
    const known = REASONS.find(([needle]) => error.message.includes(needle));
    return { ok: false, message: known ? known[1] : "The jobs could not be combined." };
  }
  for (const path of ["/jobs", "/calendar", "/season", "/staffing", "/orders", "/"]) revalidatePath(path);
  revalidatePath(`/jobs/${parsed.data.keep}`);
  redirect(`/jobs/${parsed.data.keep}#days`);
}
