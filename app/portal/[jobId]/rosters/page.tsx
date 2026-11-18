import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { planningDates } from "@/lib/planning/dates";
import { portalJob } from "@/lib/portal/job";
import { formatBytes, ROSTER_TYPES } from "@/lib/rosters/types";
import { readRosterAgain } from "./actions";
import { RosterUploader } from "./uploader";

export default async function RostersPage({ params }: PageProps<"/portal/[jobId]/rosters">) {
  const { jobId } = await params;
  const ctx = await portalJob(jobId);
  if (!ctx) notFound();

  const [{ data: files }, { data: days }, { data: due }, { data: versions }] = await Promise.all([
    ctx.supabase
      .from("roster_files")
      .select("id, file_name, mime_type, size_bytes, source, uploaded_at")
      .eq("job_id", jobId)
      .order("uploaded_at", { ascending: false }),
    ctx.supabase.from("photo_days").select("date").eq("job_id", jobId).order("date").limit(1),
    ctx.supabase.rpc("planning_due", { p_job_id: jobId }),
    ctx.supabase.from("roster_versions").select("file_ids, status, team_count, subject_count, questions, version").eq("job_id", jobId).order("version", { ascending: false }),
  ]);
  // The newest read of each file.
  const readOf = new Map<string, NonNullable<typeof versions>[number]>();
  for (const v of versions ?? []) for (const id of v.file_ids) if (!readOf.has(id)) readOf.set(id, v);
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
            {files.map((f) => {
              const read = readOf.get(f.id);
              const questions = Array.isArray(read?.questions) ? (read.questions as unknown[]).filter((q): q is string => typeof q === "string") : [];
              return (
                <li key={f.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <a href={`/portal/${jobId}/rosters/${f.id}`} className="font-medium text-accent hover:underline">
                      {f.file_name}
                    </a>
                    <span className="text-muted">
                      {ROSTER_TYPES[f.mime_type] ?? "File"} · {formatBytes(f.size_bytes)} · {formatDate(f.uploaded_at.slice(0, 10))}
                      {f.source !== "portal" && ` · ${f.source === "email" ? "by email" : "added by the office"}`}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
                    <span>
                      {read?.team_count
                        ? `${read.team_count} ${read.team_count === 1 ? "team" : "teams"}${read.subject_count ? `, ${read.subject_count} players` : ""} read into your schedule step.`
                        : read
                          ? "We will read this one by hand and add your teams."
                          : "Not read yet."}
                    </span>
                    {ctx.office && (
                      <form action={readRosterAgain.bind(null, jobId, f.id)}>
                        <button className="underline-offset-2 hover:text-text hover:underline">Office: read again</button>
                      </form>
                    )}
                  </div>
                  {ctx.viewer.staff && questions.length > 0 && (
                    <ul className="mt-2 list-disc rounded-lg bg-surface-2 py-2 pl-7 pr-3 text-xs text-warn">
                      {questions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
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
