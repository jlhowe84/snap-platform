"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Tasks are written as the signed-in person: any staff role may add and work
// tasks in their own company (RLS), and only owner and admin may delete.

export type TaskState = { ok: boolean; message: string } | null;

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const New = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.preprocess(blank, z.string().trim().max(2000).optional()),
  due_on: z.preprocess(blank, z.iso.date().optional()),
  assignee_id: z.preprocess(blank, z.uuid().optional()),
});

function refresh() {
  revalidatePath("/");
  revalidatePath("/tasks");
}

export async function addTask(_prev: TaskState, form: FormData): Promise<TaskState> {
  const viewer = await requireStaff();
  const t = New.safeParse({ title: form.get("title"), notes: form.get("notes"), due_on: form.get("due_on"), assignee_id: form.get("assignee_id") });
  if (!t.success || !viewer.companyId) return { ok: false, message: "A task needs a title." };
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    company_id: viewer.companyId,
    title: t.data.title,
    notes: t.data.notes ?? null,
    due_on: t.data.due_on ?? null,
    assignee_id: t.data.assignee_id ?? null,
    created_by: viewer.id,
  });
  if (error) return { ok: false, message: "The task could not be added." };
  refresh();
  return { ok: true, message: "Added." };
}

const Status = z.enum(["todo", "in_progress", "waiting", "done", "cancelled"]);

export async function setTaskStatus(taskId: string, status: z.infer<typeof Status>) {
  const viewer = await requireStaff();
  if (!z.uuid().safeParse(taskId).success || !Status.safeParse(status).success) return;
  const closed = status === "done";
  const supabase = await createClient();
  await supabase
    .from("tasks")
    .update({ status, completed_at: closed ? new Date().toISOString() : null, completed_by: closed ? viewer.id : null })
    .eq("id", taskId);
  refresh();
}

export async function assignTask(taskId: string, form: FormData) {
  await requireStaff();
  const who = z.preprocess(blank, z.uuid().optional()).safeParse(form.get("assignee_id"));
  if (!z.uuid().safeParse(taskId).success || !who.success) return;
  const supabase = await createClient();
  await supabase.from("tasks").update({ assignee_id: who.data ?? null }).eq("id", taskId);
  refresh();
}
