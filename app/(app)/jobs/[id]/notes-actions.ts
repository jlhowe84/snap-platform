"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type NotesState = { ok: boolean; message: string } | null;

const Note = z.object({ jobId: z.uuid(), body: z.string().trim().min(1).max(5000) });

// Adds one entry to the job's notes log, under the signed-in person's name.
// RLS decides who may write and refuses a note in someone else's name.
export async function addJobNote(jobId: string, _prev: NotesState, form: FormData): Promise<NotesState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  const parsed = Note.safeParse({ jobId, body: form.get("body") ?? "" });
  if (!parsed.success) return { ok: false, message: "Write a note first. A note holds up to 5,000 characters." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("job_notes")
    .insert({ company_id: viewer.companyId, job_id: parsed.data.jobId, body: parsed.data.body, author_id: viewer.id });
  if (error) return { ok: false, message: "The note could not be added." };
  revalidatePath(`/jobs/${parsed.data.jobId}`);
  return { ok: true, message: "Note added." };
}

// Removes one entry. The database lets the author, an owner or an admin do it.
export async function deleteJobNote(jobId: string, noteId: string): Promise<NotesState> {
  await requireStaff(OFFICE_ROLES);
  const ids = z.object({ job: z.uuid(), note: z.uuid() }).safeParse({ job: jobId, note: noteId });
  if (!ids.success) return { ok: false, message: "That note was not found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("job_notes").delete().eq("id", ids.data.note).eq("job_id", ids.data.job).select("id");
  if (error || !data?.length) return { ok: false, message: "Only the person who wrote a note, an owner or an admin can delete it." };
  revalidatePath(`/jobs/${ids.data.job}`);
  return { ok: true, message: "Note deleted." };
}
