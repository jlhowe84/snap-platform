import type { Metadata } from "next";
import Link from "next/link";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { formatDate, todayIn } from "@/lib/dates";
import { STAGE_LABEL } from "@/lib/labels";
import { buildBoard, type BoardCard, type BoardJob, type BoardTask } from "@/lib/production/board";
import { finishTask, markDelivered, startProduction } from "./actions";

export const metadata: Metadata = { title: "Production" };

const LAB_LABEL: Record<string, string> = { marco: "Marco", alkit: "Alkit", skylab: "Skylab" };
const primary = "min-h-12 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink hover:brightness-110 sm:min-h-0 sm:py-1.5";
const quiet = "min-h-12 rounded-lg border border-line px-4 text-sm font-semibold hover:border-accent hover:text-accent sm:min-h-0 sm:py-1.5";

/**
 * The production board: every job between its last photo day and delivery.
 * A job's stage comes from its production tasks, so the way to move a job is
 * to finish its next task.
 */
export default async function ProductionPage() {
  const viewer = await requireStaff(OFFICE_ROLES);
  const supabase = await createClient();
  const today = todayIn(viewer.timeZone);

  const { data: jobRows } = await supabase
    .from("jobs")
    .select("id, name, status, lab, production_stage, production_stage_since, production_started_at, photo_days(date)")
    .in("status", ["planning", "in_production", "at_lab"])
    .limit(2000);
  const jobs: BoardJob[] = (jobRows ?? []).map((j) => ({ ...j, days: (j.photo_days ?? []).map((d) => d.date) }));
  const working = jobs.filter((j) => j.status === "in_production").map((j) => j.id);
  const { data: taskRows } = working.length
    ? await supabase
        .from("tasks")
        .select("id, job_id, title, status, due_on, playbook_steps!inner(position, playbooks!inner(kind))")
        .in("job_id", working)
        .eq("playbook_steps.playbooks.kind", "production")
        .limit(10000)
    : { data: [] };
  const tasks: BoardTask[] = (taskRows ?? []).map((t) => ({
    id: t.id,
    job_id: t.job_id!,
    title: t.title,
    status: t.status,
    due_on: t.due_on,
    position: Number(t.playbook_steps.position),
  }));

  const board = buildBoard(jobs, tasks, today);
  const inProduction = board.stages.reduce((n, s) => n + s.cards.length, 0);
  const late = board.stages.reduce((n, s) => n + s.cards.filter((c) => c.late > 0).length, 0);
  const labs = [...new Set(board.atLab.map((c) => c.job.lab ?? ""))].sort();

  return (
    <>
      <PageHeader eyebrow="Jobs" title="Production" />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Ready to start" value={board.ready.length} hint="Photo days over, production not started" />
        <Stat label="In production" value={inProduction} hint={late ? `${late} with a task past due` : "None with a task past due"} />
        <Stat label="At the lab" value={board.atLab.length} hint="Released and not yet delivered" />
      </div>

      <div className="space-y-6">
        {board.ready.length > 0 && (
          <Card title={`Ready to start (${board.ready.length})`}>
            <p className="mb-3 text-sm text-muted">
              Starting production gives the job its production tasks, with due dates counted from its last photo day.
            </p>
            <ul className="divide-y divide-line">
              {board.ready.map((c) => (
                <li key={c.job.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <Link href={`/jobs/${c.job.id}`} className="font-medium hover:text-accent">
                      {c.job.name}
                    </Link>
                    <p className="text-muted">Last photo day {formatDate(c.lastDay)}</p>
                  </div>
                  <form action={startProduction.bind(null, c.job.id)}>
                    <SubmitButton className={primary}>Start production</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {board.stages.map(({ stage, cards }) => (
            <section key={stage} className="min-w-0 rounded-xl border border-line bg-surface p-4">
              <h2 className="mb-3 flex items-baseline justify-between font-display text-lg font-semibold uppercase tracking-wider text-muted">
                {STAGE_LABEL[stage]}
                <span className="text-sm">{cards.length}</span>
              </h2>
              {cards.length ? (
                <ul className="space-y-3">
                  {cards.map((c) => (
                    <StageCard key={c.job.id} card={c} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No jobs here.</p>
              )}
            </section>
          ))}
        </div>

        <Card title={`At the lab (${board.atLab.length})`}>
          {board.atLab.length ? (
            <div className="space-y-3">
              {labs.map((lab) => {
                const rows = board.atLab.filter((c) => (c.job.lab ?? "") === lab);
                return (
                  <details key={lab || "none"} className="rounded-lg border border-line">
                    <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 font-medium hover:text-accent">
                      <span>{lab ? (LAB_LABEL[lab] ?? lab) : "No lab set"}</span>
                      <span className="text-sm text-muted">{rows.length} {rows.length === 1 ? "job" : "jobs"}</span>
                    </summary>
                    <ul className="divide-y divide-line border-t border-line px-4">
                      {rows.map((c) => (
                        <li key={c.job.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                          <div className="min-w-0">
                            <Link href={`/jobs/${c.job.id}`} className="font-medium hover:text-accent">
                              {c.job.name}
                            </Link>
                            <p className="text-muted">
                              {c.lastDay ? `Photo day ${formatDate(c.lastDay)}` : "No photo day"}
                              {c.daysInStage !== null ? ` · at the lab ${c.daysInStage} ${c.daysInStage === 1 ? "day" : "days"}` : ""}
                            </p>
                          </div>
                          <form action={markDelivered.bind(null, c.job.id)}>
                            <ConfirmButton ask="Mark this job delivered?" className={quiet}>
                              Mark delivered
                            </ConfirmButton>
                          </form>
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })}
            </div>
          ) : (
            <Empty>No jobs are at the lab.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}

function StageCard({ card: c }: { card: BoardCard }) {
  return (
    <li className="rounded-lg border border-line p-3 text-sm">
      <Link href={`/jobs/${c.job.id}#tasks`} className="font-medium hover:text-accent">
        {c.job.name}
      </Link>
      <p className="mt-0.5 text-muted">
        {c.lastDay ? `Photo day ${formatDate(c.lastDay)}` : "No photo day"}
        {c.total ? ` · ${c.done} of ${c.total} tasks done` : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {c.daysInStage !== null && <Pill>{c.daysInStage === 0 ? "Here since today" : `Here ${c.daysInStage} ${c.daysInStage === 1 ? "day" : "days"}`}</Pill>}
        {c.late > 0 && <Pill tone="risk">{c.late} past due</Pill>}
      </div>
      {c.total === 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted">No production tasks on this job yet.</p>
          <form action={startProduction.bind(null, c.job.id)}>
            <SubmitButton className={quiet}>Add the tasks</SubmitButton>
          </form>
        </div>
      ) : c.next ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <p className="min-w-0 flex-1">
            <span className="block text-xs uppercase tracking-wider text-muted">Next</span>
            {c.next.title}
            {c.next.due_on && <span className="text-muted"> · due {formatDate(c.next.due_on)}</span>}
          </p>
          <form action={finishTask.bind(null, c.job.id, c.next.id)}>
            <SubmitButton className={primary}>Done</SubmitButton>
          </form>
        </div>
      ) : (
        <p className="mt-3 text-muted">Every task is done.</p>
      )}
    </li>
  );
}
