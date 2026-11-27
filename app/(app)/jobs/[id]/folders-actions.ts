"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type FolderState = { ok: boolean; message: string } | null;

const Name = z.union([
  z.literal(""),
  z.string().trim().min(1).max(200).refine((s) => !/[/:]/.test(s) && !s.startsWith("."), "not a folder name"),
]);

// The folder name the helper uses for this job. Empty goes back to "YY <Job name>".
export async function setFolderName(jobId: string, _prev: FolderState, form: FormData): Promise<FolderState> {
  await requireStaff(OFFICE_ROLES);
  const name = Name.safeParse(form.get("nas_folder") ?? "");
  if (!z.uuid().safeParse(jobId).success || !name.success) return { ok: false, message: "A folder name cannot hold / or : or start with a dot." };
  const supabase = await createClient();
  const { error } = await supabase.from("jobs").update({ nas_folder: name.data || null }).eq("id", jobId);
  if (error) return { ok: false, message: "That could not be saved." };
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true, message: "Folder name saved. The helper uses it from its next run." };
}
