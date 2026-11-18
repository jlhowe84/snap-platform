"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, OFFICE_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  removeRosterObject, rosterObject, rosterPrefix, rosterText, rosterUploadLink, STANDARD_FOLDER,
} from "@/lib/rosters/files";
import { readStandardRoster, STANDARD_MAX_BYTES } from "@/lib/rosters/standard";

// The finished SNAP roster file. Rosters are normalized outside the platform;
// the office uploads the result here. The file is checked against the format
// before anything is saved, and a file that fails is not kept.

const Start = z.object({
  jobId: z.uuid(),
  name: z.string().min(1).max(200).regex(/\.csv$/i),
  size: z.number().int().positive().max(STANDARD_MAX_BYTES),
});

export type StandardStart = { ok: true; path: string; token: string } | { ok: false; message: string };

async function officeJob(jobId: string) {
  await requireStaff(OFFICE_ROLES);
  const supabase = await createClient();
  const { data: job } = await supabase.from("jobs").select("id, company_id").eq("id", jobId).maybeSingle();
  return job ? { supabase, job } : null;
}

export async function startStandardRoster(jobId: string, file: { name: string; size: number }): Promise<StandardStart> {
  const parsed = Start.safeParse({ jobId, ...file });
  if (!parsed.success) return { ok: false, message: "The finished roster is a CSV file under 5 MB." };
  const ctx = await officeJob(parsed.data.jobId);
  if (!ctx) return { ok: false, message: "That job was not found." };
  try {
    const link = await rosterUploadLink(ctx.job.company_id, jobId, parsed.data.name, STANDARD_FOLDER);
    return { ok: true, ...link };
  } catch {
    return { ok: false, message: "The upload could not start. Try again." };
  }
}

export type StandardResult =
  | { ok: true; teams: number; players: number; unassigned: number; added: number; updated: number; removed: number; kept: number }
  | { ok: false; message: string; problems?: string[] };

export async function finishStandardRoster(jobId: string, path: string): Promise<StandardResult> {
  if (!z.uuid().safeParse(jobId).success) return { ok: false, message: "That job was not found." };
  const ctx = await officeJob(jobId);
  if (!ctx) return { ok: false, message: "That job was not found." };
  if (!path.startsWith(`${rosterPrefix(ctx.job.company_id, jobId)}${STANDARD_FOLDER}`) || path.includes("..")) {
    return { ok: false, message: "That upload does not belong to this job." };
  }

  const object = await rosterObject(path);
  const text = object && object.size <= STANDARD_MAX_BYTES ? await rosterText(path) : null;
  if (text === null) {
    await removeRosterObject(path);
    return { ok: false, message: "The file did not arrive. Try again." };
  }

  const roster = readStandardRoster(text);
  if (!roster.ok) {
    await removeRosterObject(path);
    return { ok: false, message: "This file is not in the SNAP roster format, so nothing was imported.", problems: roster.problems };
  }
  if (!roster.teams.length) {
    await removeRosterObject(path);
    return { ok: false, message: "The file has no teams yet (every player is still unassigned), so nothing was imported." };
  }

  const { data, error } = await ctx.supabase.rpc("import_standard_roster", {
    p_job_id: jobId,
    p_csv_path: path,
    p_teams: roster.teams,
    p_subject_count: roster.players,
  });
  if (error) {
    await removeRosterObject(path);
    return {
      ok: false,
      message: error.code === "23505"
        ? "Two teams on this job would end up with the same name and division. Rename the one typed in by hand, then upload again."
        : "The roster could not be saved. Try again.",
    };
  }
  const counts = (data ?? {}) as Record<string, number>;
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/portal/${jobId}/schedule`);
  return {
    ok: true,
    teams: roster.teams.length,
    players: roster.players,
    unassigned: roster.unassigned,
    added: counts.added ?? 0,
    updated: counts.updated ?? 0,
    removed: counts.removed ?? 0,
    kept: counts.kept ?? 0,
  };
}
