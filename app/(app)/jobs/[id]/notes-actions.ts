"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type NotesState = { ok: boolean; message: string } | null;

const Notes = z.object({ jobId: z.uuid(), notes: z.string().trim().max(10000) });

// The job's office notes: free text, kept on the job. RLS decides who may write.
export async function saveJobNotes(jobId: string, _prev: NotesState, form: FormData): Promise<NotesState> {
  await requireStaff(OFFICE_ROLES);
  const parsed = Notes.safeParse({ jobId, notes: form.get("notes") ?? "" });
  if (!parsed.success) return { ok: false, message: "Notes hold up to 10,000 characters." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("jobs").update({ notes: parsed.data.notes || null }).eq("id", parsed.data.jobId).select("id");
  if (error || !data?.length) return { ok: false, message: "The notes could not be saved." };
  revalidatePath(`/jobs/${parsed.data.jobId}`);
  return { ok: true, message: "Notes saved." };
}
