import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROSTER_MAX_BYTES, ROSTER_TYPES } from "./types";

export const ROSTER_BUCKET = "rosters";

// Roster files hold children's names. The bucket is private with no
// policies; every link below is made by the server after the caller has
// passed an RLS check on the job as the signed-in person.

function safeName(name: string) {
  const cleaned = name.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+/, "").slice(-80);
  return cleaned || "roster";
}

export function rosterPrefix(companyId: string, jobId: string) {
  return `${companyId}/${jobId}/`;
}

/** A one-time link the browser uploads one file to. */
export async function rosterUploadLink(companyId: string, jobId: string, fileName: string, folder = "") {
  const path = `${rosterPrefix(companyId, jobId)}${folder}${randomUUID()}-${safeName(fileName)}`;
  const { data, error } = await createAdminClient().storage.from(ROSTER_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error("could not start the upload");
  return { path, token: data.token };
}

/** What actually landed in the bucket, so the row records the truth. */
export async function rosterObject(path: string): Promise<{ size: number; mime: string } | null> {
  const slash = path.lastIndexOf("/");
  const { data, error } = await createAdminClient()
    .storage.from(ROSTER_BUCKET)
    .list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 5 });
  if (error) return null;
  const hit = data?.find((o) => o.name === path.slice(slash + 1));
  const size = Number(hit?.metadata?.size);
  const mime = String(hit?.metadata?.mimetype ?? "");
  if (!hit || !Number.isFinite(size) || size <= 0 || size > ROSTER_MAX_BYTES || !(mime in ROSTER_TYPES)) return null;
  return { size, mime };
}

export async function removeRosterObject(path: string) {
  await createAdminClient().storage.from(ROSTER_BUCKET).remove([path]);
}

/** A five-minute download link, for someone who has already passed an RLS read. */
export async function rosterDownloadUrl(path: string, fileName: string) {
  const { data, error } = await createAdminClient()
    .storage.from(ROSTER_BUCKET)
    .createSignedUrl(path, 300, { download: fileName });
  if (error || !data) throw new Error("could not make a download link");
  return data.signedUrl;
}

/** Where the finished SNAP roster files of a job live, apart from what the league sent. */
export const STANDARD_FOLDER = "standard/";

/** The text of a small file in the bucket, for the server to check. */
export async function rosterText(path: string): Promise<string | null> {
  const { data, error } = await createAdminClient().storage.from(ROSTER_BUCKET).download(path);
  if (error || !data) return null;
  return await data.text();
}
