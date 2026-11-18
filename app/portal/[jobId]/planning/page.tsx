import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Pill } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { readAnswers, stillToCome } from "@/lib/planning/form";
import { portalJob } from "@/lib/portal/job";
import { PlanningForm } from "./form";

export default async function PlanningPage({ params }: PageProps<"/portal/[jobId]/planning">) {
  const { jobId } = await params;
  const ctx = await portalJob(jobId);
  if (!ctx) notFound();

  const { data: form } = await ctx.supabase
    .from("planning_forms")
    .select("answers, submitted_at")
    .eq("job_id", jobId)
    .maybeSingle();
  const answers = readAnswers(form?.answers);
  const missing = stillToCome(answers);

  return (
    <>
      <Link href={`/portal/${jobId}`} className="text-sm text-muted underline-offset-2 hover:underline">
        Back to your steps
      </Link>
      <PageHeader eyebrow={ctx.job.name} title="Plan your photo day">
        {form?.submitted_at ? (
          <Pill tone="ok">Sent {formatDate(form.submitted_at.slice(0, 10))}</Pill>
        ) : (
          <Pill tone="warn">Not sent yet</Pill>
        )}
      </PageHeader>
      <p className="mb-6 text-sm text-muted">
        About five minutes. You can send what you have and come back to add the rest.
        {missing.length > 0 && ` Still to come: ${missing.join(", ")}.`}
      </p>
      {!ctx.canEdit && !ctx.viewer.staff && (
        <p className="mb-6 rounded-lg border border-line p-4 text-sm text-muted">
          {ctx.signed ? "This photo day is closed, so the form can no longer be changed." : "This step opens once the agreement is signed."}
        </p>
      )}
      <PlanningForm jobId={jobId} answers={answers} canEdit={ctx.canEdit} submitted={!!form?.submitted_at} />
    </>
  );
}
