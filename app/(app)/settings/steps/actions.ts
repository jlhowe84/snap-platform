"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, ADMIN_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { neighbour, readStepForm, stepRow } from "@/lib/playbooks/steps";

// Owner and admin edit the playbook steps. Every write is made as the
// signed-in person, so RLS has the last word. A step that tasks were made
// from can only be switched off, so those tasks keep their link; a step no
// task has used can be removed.

export type StepState = { ok: boolean; message: string } | null;

const PROBLEM = "A step needs a name. Days must be a whole number from 0 to 365.";

function refresh() {
  revalidatePath("/settings/steps");
  revalidatePath("/jobs", "layout");
}

export async function saveStep(stepId: string, _prev: StepState, form: FormData): Promise<StepState> {
  await requireStaff(ADMIN_ROLES);
  const parsed = readStepForm(form);
  if (!z.uuid().safeParse(stepId).success || !parsed.success) return { ok: false, message: PROBLEM };
  const supabase = await createClient();
  const { data: step } = await supabase.from("playbook_steps").select("id, tags").eq("id", stepId).maybeSingle();
  if (!step) return { ok: false, message: "That step could not be found." };
  const { error } = await supabase.from("playbook_steps").update(stepRow(parsed.data, step.tags)).eq("id", stepId);
  if (error) return { ok: false, message: "The step could not be saved." };
  refresh();
  return { ok: true, message: "Saved." };
}

export async function addStep(playbookId: string, _prev: StepState, form: FormData): Promise<StepState> {
  const viewer = await requireStaff(ADMIN_ROLES);
  const parsed = readStepForm(form);
  if (!viewer.companyId || !z.uuid().safeParse(playbookId).success || !parsed.success) return { ok: false, message: PROBLEM };
  const supabase = await createClient();
  const [{ data: playbook }, { data: last }] = await Promise.all([
    supabase.from("playbooks").select("id").eq("id", playbookId).maybeSingle(),
    supabase.from("playbook_steps").select("position").eq("playbook_id", playbookId).order("position", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!playbook) return { ok: false, message: "That list could not be found." };
  const { error } = await supabase.from("playbook_steps").insert({
    company_id: viewer.companyId,
    playbook_id: playbookId,
    position: Math.floor(Number(last?.position ?? 0)) + 1,
    ...stepRow(parsed.data),
  });
  if (error) return { ok: false, message: "The step could not be added." };
  refresh();
  return { ok: true, message: "Added at the end of the list." };
}

export async function removeStep(stepId: string, _prev: StepState, _form: FormData): Promise<StepState> {
  await requireStaff(ADMIN_ROLES);
  if (!z.uuid().safeParse(stepId).success) return { ok: false, message: "That step could not be found." };
  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("playbook_step_id", stepId);
  if (countError) return { ok: false, message: "The step could not be checked. Nothing was removed." };
  if (count) {
    return {
      ok: false,
      message: `${count} ${count === 1 ? "task was" : "tasks were"} made from this step, so it cannot be removed. Untick "In use" to switch it off.`,
    };
  }
  const { data, error } = await supabase.from("playbook_steps").delete().eq("id", stepId).select("id");
  if (error || !data?.length) return { ok: false, message: "The step could not be removed." };
  refresh();
  return { ok: true, message: "Removed." };
}

export async function moveStep(stepId: string, direction: "up" | "down") {
  await requireStaff(ADMIN_ROLES);
  if (!z.uuid().safeParse(stepId).success || !["up", "down"].includes(direction)) return;
  const supabase = await createClient();
  const { data: step } = await supabase.from("playbook_steps").select("id, playbook_id").eq("id", stepId).maybeSingle();
  if (!step) return;
  const { data: all } = await supabase
    .from("playbook_steps")
    .select("id, position")
    .eq("playbook_id", step.playbook_id)
    .order("position")
    .order("created_at");
  const ordered = all ?? [];
  if (!neighbour(ordered, stepId, direction)) return;

  // Renumber the whole list 1..n with the two steps swapped, so equal or
  // uneven positions from an import cannot leave a move with no effect.
  const i = ordered.findIndex((s) => s.id === stepId);
  const j = direction === "up" ? i - 1 : i + 1;
  [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  for (const [n, s] of ordered.entries()) {
    if (Number(s.position) !== n + 1) await supabase.from("playbook_steps").update({ position: n + 1 }).eq("id", s.id);
  }
  refresh();
}
