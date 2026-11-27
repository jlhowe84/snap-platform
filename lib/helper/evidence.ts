// The production iMac helper's side of the platform, without the network or
// the database: which jobs it is told about, what a report may hold, and when
// the evidence says the import and the NAS upload are done. Tested on its own.
//
// Josh, 2026-11-26: the import is done when images from every photographer
// part are in the job's PHOTO IMPORT folder; the upload is done when the files
// are on the NAS in PHOTOS/<YY Job>.

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

/** A helper key: 32 random bytes, shown once. Only its SHA-256 is stored. */
export function newHelperKey() {
  const key = `snaph_${randomBytes(32).toString("base64url")}`;
  return { key, hash: hashHelperKey(key) };
}

export function hashHelperKey(key: string) {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function looksLikeHelperKey(value: string) {
  return /^snaph_[A-Za-z0-9_-]{43}$/.test(value);
}

/** "26 Delco Phantoms Ice Hockey": the two-digit year of the first photo day, then the job's name made safe for a folder. */
export function defaultFolderName(jobName: string, firstPhotoDay: string | null, today: string): string {
  const year = (firstPhotoDay && /^\d{4}/.test(firstPhotoDay) ? firstPhotoDay : today).slice(2, 4);
  const name = jobName.replace(/[/:]/g, "-").replace(/\s+/g, " ").trim().replace(/^\.+|\.+$/g, "");
  return `${year} ${name}`;
}

export type HelperJobRow = {
  id: string;
  name: string;
  status: string;
  nas_folder: string | null;
  production_started_at: string | null;
  days: string[];
};

export type HelperJob = {
  id: string;
  folder: string;
  /** Make the folder and session if they are missing. */
  create: boolean;
  /** Count images in PHOTO IMPORT. */
  import: boolean;
  /** Count images on the NAS. */
  upload: boolean;
};

const DAY = 86_400_000;

/**
 * What the helper is told each run. Folders are made only for jobs in
 * production that started after this computer was connected, so folders made
 * by hand under other names are never doubled. A job is watched for its
 * import while in production and for its upload until the NAS copy is seen,
 * for up to 60 days after its last photo day.
 */
export function helperJobs(
  rows: HelperJobRow[],
  evidence: Map<string, { import_done_at: string | null; upload_done_at: string | null }>,
  opts: { connectedAt: string; today: string },
): HelperJob[] {
  const out: HelperJob[] = [];
  const todayMs = Date.parse(`${opts.today}T00:00:00Z`);
  for (const j of rows) {
    const days = [...j.days].sort();
    const last = days.at(-1) ?? null;
    if (last && todayMs - Date.parse(`${last}T00:00:00Z`) > 60 * DAY) continue;
    const e = evidence.get(j.id);
    const inProduction = j.status === "in_production";
    const create = inProduction && !!j.production_started_at && j.production_started_at >= opts.connectedAt;
    const watchImport = inProduction && !e?.import_done_at;
    const watchUpload = ["in_production", "at_lab", "delivered"].includes(j.status) && !e?.upload_done_at;
    if (!create && !watchImport && !watchUpload) continue;
    out.push({
      id: j.id,
      folder: j.nas_folder?.trim() || defaultFolderName(j.name, days[0] ?? null, opts.today),
      create,
      import: watchImport,
      upload: watchUpload,
    });
  }
  return out;
}

const Count = z.number().int().min(0).max(10_000_000);
const FolderName = z.string().min(1).max(200).refine((s) => !/[/:]/.test(s) && !s.startsWith("."), "not a folder name");

export const HelperReport = z.object({
  version: z.string().max(40),
  photo_import_found: z.boolean(),
  nas_mounted: z.boolean(),
  problem: z.string().max(500).nullable().optional(),
  jobs: z
    .array(
      z.object({
        id: z.uuid(),
        folder: FolderName,
        created: z.boolean().optional(),
        import: z
          .object({
            exists: z.boolean(),
            parts: z.array(z.object({ name: FolderName, images: Count })).max(50),
            session_exists: z.boolean(),
            session_images: Count,
          })
          .nullable()
          .optional(),
        upload: z.object({ exists: z.boolean(), images: Count, receipt: z.boolean() }).nullable().optional(),
      }),
    )
    .max(500),
});
export type HelperReport = z.infer<typeof HelperReport>;

export type Evidence = {
  import_parts: { name: string; images: number }[];
  import_images: number;
  import_images_max: number;
  session_images: number;
  upload_exists: boolean | null;
  upload_images: number | null;
};

/**
 * Import is done when as many part folders hold images as photographers were
 * booked (at least one). A job folder with no part folders counts the session
 * instead. Upload is done when the NAS holds at least as many images as were
 * ever seen in PHOTO IMPORT, and some.
 */
export function evidenceDone(e: Evidence, photographers: number): { importDone: boolean; uploadDone: boolean } {
  const filled = e.import_parts.filter((p) => p.images > 0).length;
  const importDone = e.import_parts.length ? filled >= Math.max(1, photographers) : e.session_images > 0;
  const uploadDone = !!e.upload_exists && (e.upload_images ?? 0) > 0 && (e.upload_images ?? 0) >= e.import_images_max;
  return { importDone, uploadDone };
}

/** A line for the board and the job page. */
export function evidenceLine(e: { import_done_at: string | null; upload_done_at: string | null; import_images: number; upload_images: number | null } | null): string {
  if (!e) return "No report from the iMac yet";
  const parts = [
    e.import_done_at ? "Import done" : e.import_images ? `${e.import_images.toLocaleString("en-US")} images in PHOTO IMPORT` : "Nothing imported yet",
    e.upload_done_at ? "On the NAS" : e.upload_images ? `${e.upload_images.toLocaleString("en-US")} on the NAS` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}
