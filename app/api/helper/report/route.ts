import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { helperFrom } from "@/lib/helper/auth";
import { evidenceDone, HelperReport } from "@/lib/helper/evidence";

// The iMac helper reports what it saw: per job, the folder name, image counts
// per part folder, whether the Capture One session exists, and the NAS copy.
// Only jobs of the device's own company are recorded.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const device = await helperFrom(request);
  if (!device) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = HelperReport.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad report" }, { status: 400 });
  const report = parsed.data;
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const ids = report.jobs.map((j) => j.id);
  const [{ data: jobs }, { data: before }, { data: shifts }] = ids.length
    ? await Promise.all([
        admin.from("jobs").select("id, nas_folder").eq("company_id", device.company_id).in("id", ids),
        admin.from("job_folder_evidence").select("*").eq("company_id", device.company_id).in("job_id", ids),
        admin.from("shifts").select("job_id").eq("company_id", device.company_id).in("job_id", ids).eq("position", "photographer").eq("status", "filled"),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const known = new Map((jobs ?? []).map((j) => [j.id, j]));
  const had = new Map((before ?? []).map((e) => [e.job_id, e]));
  const photographers = new Map<string, number>();
  for (const s of shifts ?? []) photographers.set(s.job_id, (photographers.get(s.job_id) ?? 0) + 1);

  let recorded = 0;
  let created = 0;
  for (const j of report.jobs) {
    const job = known.get(j.id);
    if (!job) continue;
    const prev = had.get(j.id);
    const imp = j.import ?? null;
    const up = report.nas_mounted ? (j.upload ?? null) : null;
    const importImages = imp ? imp.parts.reduce((t, p) => t + p.images, 0) + imp.session_images : (prev?.import_images ?? 0);
    const row = {
      job_id: j.id,
      company_id: device.company_id,
      device_id: device.id,
      folder: j.folder,
      import_exists: imp ? imp.exists : (prev?.import_exists ?? false),
      import_parts: imp ? imp.parts : ((prev?.import_parts as { name: string; images: number }[] | undefined) ?? []),
      import_images: importImages,
      import_images_max: Math.max(prev?.import_images_max ?? 0, importImages),
      session_exists: imp ? imp.session_exists : (prev?.session_exists ?? false),
      session_images: imp ? imp.session_images : (prev?.session_images ?? 0),
      upload_exists: up ? up.exists : (prev?.upload_exists ?? null),
      upload_images: up ? up.images : (prev?.upload_images ?? null),
      upload_receipt: up ? up.receipt : (prev?.upload_receipt ?? null),
      folder_created_at: j.created ? now : (prev?.folder_created_at ?? null),
      reported_at: now,
    };
    const done = evidenceDone(row, photographers.get(j.id) ?? 0);
    const { error } = await admin.from("job_folder_evidence").upsert({
      ...row,
      import_done_at: prev?.import_done_at ?? (done.importDone ? now : null),
      upload_done_at: prev?.upload_done_at ?? (done.uploadDone ? now : null),
    });
    if (error) continue;
    recorded++;
    if (j.created) created++;
    // Remember the folder the helper made or found, so a later rename of the job does not lose it.
    if (!job.nas_folder && (j.created || imp?.exists)) await admin.from("jobs").update({ nas_folder: j.folder }).eq("id", j.id);
  }

  await admin
    .from("helper_devices")
    .update({
      last_seen_at: now,
      last_version: report.version,
      last_report: { photo_import: report.photo_import_found, nas: report.nas_mounted, jobs: recorded, created, problem: report.problem ?? null },
    })
    .eq("id", device.id);
  return NextResponse.json({ recorded });
}
