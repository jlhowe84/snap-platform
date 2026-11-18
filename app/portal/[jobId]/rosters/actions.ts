"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { portalJob } from "@/lib/portal/job";
import { processRosterFile } from "@/lib/rosters/process";
import { removeRosterObject, rosterObject, rosterPrefix, rosterUploadLink } from "@/lib/rosters/files";
import { ROSTER_MAX_BYTES, rosterMime } from "@/lib/rosters/types";

const Start = z.object({ name: z.string().min(1).max(200), size: z.number().int().positive().max(ROSTER_MAX_BYTES) });

export type StartResult = { ok: true; path: string; token: string; mime: string } | { ok: false; message: string };

// Step 1: check the person and the file, then hand the browser a one-time
// upload link. The file goes straight to storage (it can be 25 MB).
export async function startRosterUpload(jobId: string, file: { name: string; size: number }): Promise<StartResult> {
  const ctx = await portalJob(jobId);
  if (!ctx?.canEdit) return { ok: false, message: "Roster uploads are not open for this photo day." };
  const parsed = Start.safeParse(file);
  if (!parsed.success) return { ok: false, message: "That file is over 25 MB. Send it in parts, or as a PDF." };
  const mime = rosterMime(parsed.data.name);
  if (!mime) return { ok: false, message: "We can take CSV, Excel, PDF, JPG or PNG files." };
  try {
    const link = await rosterUploadLink(ctx.job.company_id, jobId, parsed.data.name);
    return { ok: true, ...link, mime };
  } catch {
    return { ok: false, message: "The upload could not start. Try again." };
  }
}

// Step 2: record what landed. The row is written as the signed-in person, so
// RLS decides (this job's coordinator, or the office); size and type come
// from storage, not from the browser.
export async function finishRosterUpload(jobId: string, path: string, name: string): Promise<{ ok: boolean; message: string }> {
  const ctx = await portalJob(jobId);
  if (!ctx?.canEdit) return { ok: false, message: "Roster uploads are not open for this photo day." };
  if (!path.startsWith(rosterPrefix(ctx.job.company_id, jobId)) || path.includes("..")) {
    return { ok: false, message: "That upload does not belong to this photo day." };
  }
  const object = await rosterObject(path);
  if (!object) return { ok: false, message: "The file did not arrive. Try again." };

  const { data: row, error } = await ctx.supabase.from("roster_files").insert({
    company_id: ctx.job.company_id,
    job_id: jobId,
    storage_path: path,
    file_name: name.slice(0, 200),
    mime_type: object.mime,
    size_bytes: object.size,
    source: ctx.viewer.staff ? "office" : "portal",
    uploaded_by: ctx.viewer.id,
  }).select("id").single();
  if (error || !row) {
    await removeRosterObject(path);
    return { ok: false, message: "The file could not be saved. Try again." };
  }
  // Read it into teams right away. The upload stands even if the read fails;
  // the office can run it again from this page.
  let message = "Received.";
  try {
    const read = await processRosterFile(row.id);
    if (read.teams) message = `Received. ${read.teams} ${read.teams === 1 ? "team" : "teams"} found.`;
  } catch {
    // Left for the office.
  }
  revalidatePath(`/portal/${jobId}`);
  revalidatePath(`/portal/${jobId}/rosters`);
  revalidatePath(`/portal/${jobId}/schedule`);
  return { ok: true, message };
}

/** Office: read a file into teams again (after a fix, or for an older upload). */
export async function readRosterAgain(jobId: string, fileId: string) {
  const ctx = await portalJob(jobId);
  if (!ctx?.office) return;
  // The read below runs as the signed-in person, so RLS confirms the file is theirs to see.
  const { data: file } = await ctx.supabase.from("roster_files").select("id").eq("id", fileId).eq("job_id", jobId).maybeSingle();
  if (!file) return;
  try {
    await processRosterFile(file.id);
  } catch {
    // The page shows the last recorded read.
  }
  revalidatePath(`/portal/${jobId}/rosters`);
  revalidatePath(`/portal/${jobId}/schedule`);
  revalidatePath(`/jobs/${jobId}`);
}
