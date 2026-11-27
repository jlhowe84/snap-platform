import { Card, Pill } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { defaultFolderName } from "@/lib/helper/evidence";
import { todayIn } from "@/lib/dates";
import { FolderNameForm } from "./folders";

/**
 * What the iMac helper last saw for this job: its PHOTO IMPORT folder, the
 * images in each part folder, the Capture One session and the NAS copy.
 */
export async function FoldersCard({
  job,
  firstDay,
  timeZone,
}: {
  job: { id: string; name: string; nas_folder: string | null };
  firstDay: string | null;
  timeZone: string;
}) {
  const supabase = await createClient();
  const { data: e } = await supabase.from("job_folder_evidence").select("*").eq("job_id", job.id).maybeSingle();
  const stamp = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const folder = job.nas_folder ?? defaultFolderName(job.name, firstDay, todayIn(timeZone));
  const parts = ((e?.import_parts ?? []) as { name: string; images: number }[]).filter((p) => p.name);
  const n = (x: number | null | undefined) => (x ?? 0).toLocaleString("en-US");

  return (
    <Card id="folders" title="Folders on the iMac">
      <div className="space-y-3 text-sm">
        <p>
          <span className="text-muted">Folder </span>
          <span className="font-mono text-xs">{folder}</span>
        </p>
        {e ? (
          <>
            <p className="flex flex-wrap gap-2">
              <Pill tone={e.import_done_at ? "ok" : "muted"}>{e.import_done_at ? `Import done ${stamp.format(new Date(e.import_done_at))}` : "Import not done"}</Pill>
              <Pill tone={e.upload_done_at ? "ok" : "muted"}>{e.upload_done_at ? `On the NAS ${stamp.format(new Date(e.upload_done_at))}` : "Not on the NAS yet"}</Pill>
            </p>
            <ul className="space-y-1">
              {!e.import_exists && <li className="text-warn">The folder is not in PHOTO IMPORT.</li>}
              {parts.map((p) => (
                <li key={p.name} className="flex justify-between gap-3">
                  <span className="truncate text-muted">{p.name}</span>
                  <span className="tabular-nums">{n(p.images)} images</span>
                </li>
              ))}
              <li className="flex justify-between gap-3">
                <span className="text-muted">Capture One session</span>
                <span>{e.session_exists ? `${n(e.session_images)} images` : "Not found"}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-muted">NAS, PHOTOS</span>
                <span>
                  {e.upload_exists === null ? "NAS not mounted" : e.upload_exists ? `${n(e.upload_images)} images${e.upload_receipt ? ", receipt" : ""}` : "Not there"}
                </span>
              </li>
            </ul>
            <p className="text-xs text-muted">Last report {stamp.format(new Date(e.reported_at))}. Most seen in PHOTO IMPORT: {n(e.import_images_max)}.</p>
          </>
        ) : (
          <p className="text-muted">No report from the iMac helper for this job yet.</p>
        )}
        <FolderNameForm jobId={job.id} current={job.nas_folder} />
      </div>
    </Card>
  );
}
