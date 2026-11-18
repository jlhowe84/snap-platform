import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { planningDates } from "@/lib/planning/dates";
import { portalJob } from "@/lib/portal/job";
import { formatBytes, ROSTER_TYPES } from "@/lib/rosters/types";
import { RosterUploader } from "./uploader";

export default async function RostersPage({ params }: PageProps<"/portal/[jobId]/rosters">) {
  const { jobId } = await params;
  const ctx = await portalJob(jobId);
  if (!ctx) notFound();

  const [{ data: files }, { data: days }, { data: due }] = await Promise.all([
    ctx.supabase
      .from("roster_files")
      .select("id, file_name, mime_type, size_bytes, source, uploaded_at")
      .eq("job_id", jobId)
      .order("uploaded_at", { ascending: false }),
    ctx.supabase.from("photo_days").select("date").eq("job_id", jobId).order("date").limit(1),
    ctx.supabase.rpc("planning_due", { p_job_id: jobId }),
  ]);
  const dates = planningDates(days?.[0]?.date ?? null, due?.[0]?.weeks_due, due?.[0]?.deadline_days);

  return (
    <>
      <Link href={`/portal/${jobId}`} className="text-sm text-muted underline-offset-2 hover:underline">
        Back to your steps
      </Link>
      <PageHeader eyebrow={ctx.job.name} title="Rosters">
        {dates.askBy && <Pill tone="warn">Due {formatDate(dates.askBy)}</Pill>}
      </PageHeader>
      <p className="mb-6 text-sm text-muted">
        Send it in whatever shape it is in: a spreadsheet, a PDF, an export from your registration site, even a photo of a
        printed list. We need team or group, athlete name, and a parent email if you have one.
        {dates.deadline && ` The last day we can take a roster is ${formatDate(dates.deadline, { weekday: true })}.`}
      </p>

      {ctx.canEdit ? (
        <RosterUploader jobId={jobId} />
      ) : (
        !ctx.viewer.staff && (
          <p className="rounded-lg border border-line p-4 text-sm text-muted">
            {ctx.signed ? "This photo day is closed, so rosters can no longer be added." : "This step opens once the agreement is signed."}
          </p>
        )
      )}

      <Card title={`Received (${files?.length ?? 0})`} className="mt-6">
        {files?.length ? (
          <ul className="divide-y divide-line">
            {files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
                <a href={`/portal/${jobId}/rosters/${f.id}`} className="font-medium text-accent hover:underline">
                  {f.file_name}
                </a>
                <span className="text-muted">
                  {ROSTER_TYPES[f.mime_type] ?? "File"} · {formatBytes(f.size_bytes)} · {formatDate(f.uploaded_at.slice(0, 10))}
                  {f.source !== "portal" && ` · ${f.source === "email" ? "by email" : "added by the office"}`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nothing yet.</Empty>
        )}
        <p className="mt-3 text-xs text-muted">
          A change or a late addition? Upload the new file. We keep every version and work from the newest.
        </p>
      </Card>
    </>
  );
}
