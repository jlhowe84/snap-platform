import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Empty, PageHeader, Pill, Stat } from "@/components/ui";
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
export default async function ProductionPage({ searchParams }: PageProps<"/production">) {
  const showAll = (await searchParams).all === "1";
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

  const { count: noPhotos } = await supabase
    .from("prepay_photo_cases")
    .select("id", { count: "exact", head: true })
    .is("cleared_at", null)
    .in("status", ["open", "offered", "makeup_booked"]);

  const { count: makeups } = await supabase.from("makeup_bookings").select("id", { count: "exact", head: true }).eq("status", "booked").gte("date", today);

  // What the iMac helper has seen: imports and NAS copies, shown on each card.
  const { data: seenRows } = working.length
    ? await supabase.from("job_folder_evidence").select("job_id, import_done_at, upload_done_at").in("job_id", working)
    : { data: [] };
  const folderSeen = new Map((seenRows ?? []).map((r) => [r.job_id, r]));

  const board = buildBoard(jobs, tasks, today);
  const inProduction = board.stages.reduce((n, s) => n + s.cards.length, 0);
  const late = board.stages.reduce((n, s) => n + s.cards.filter((c) => c.late > 0).length, 0);
  // Columns with no jobs are hidden so the board is only as wide as it needs to be.
  const emptyColumns = [
    ...(board.ready.length ? [] : ["Ready to start"]),
    ...board.stages.filter((s) => !s.cards.length).map((s) => STAGE_LABEL[s.stage]),
    ...(board.atLab.length ? [] : ["At the lab"]),
  ];
  const columnCount = board.stages.length + 2;
  const labs = [...new Set(board.atLab.map((c) => c.job.lab ?? ""))].sort();

  return (
    <>
      <PageHeader eyebrow="Jobs" title="Production">
        <Link href="/production/makeups" className={quiet + " inline-flex items-center"}>
          Makeups and retakes{makeups ? ` (${makeups})` : ""}
        </Link>
      </PageHeader>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Ready to start" value={board.ready.length} hint="Photo days over, production not started" />
        <Stat label="In production" value={inProduction} hint={late ? `${late} with a task past due` : "None with a task past due"} />
        <Stat label="At the lab" value={board.atLab.length} hint="Released and not yet delivered" />
        <Link href="/production/no-photos" className="rounded-xl hover:ring-1 hover:ring-accent">
          <Stat label="Orders with no photos" value={noPhotos ?? 0} hint="Prepay orders waiting on a makeup or refund" />
        </Link>
      </div>

      {/* One row of columns on a wide screen, each scrolling on its own; the
          columns stack on a phone, where a sideways board is hard to use. */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:overflow-x-auto md:pb-4">
        <Column title="Ready to start" count={board.ready.length} showEmpty={showAll}>
          {board.ready.map((c) => (
            <li key={c.job.id} className="rounded-lg border border-line bg-surface p-3 text-sm">
              <Link href={`/jobs/${c.job.id}`} className="font-medium hover:text-accent">
                {c.job.name}
              </Link>
              <p className="mt-0.5 text-muted">Last photo day {formatDate(c.lastDay)}</p>
              <form action={startProduction.bind(null, c.job.id)} className="mt-3">
                <SubmitButton className={primary + " w-full"}>Start production</SubmitButton>
              </form>
            </li>
          ))}
        </Column>

        {board.stages.map(({ stage, cards }) => (
          <Column key={stage} title={STAGE_LABEL[stage]} count={cards.length} showEmpty={showAll}>
            {cards.map((c) => (
              <StageCard key={c.job.id} card={c} seen={folderSeen.get(c.job.id)} />
            ))}
          </Column>
        ))}

        <Column title="At the lab" count={board.atLab.length} showEmpty={showAll}>
          {labs.map((lab) => {
            const rows = board.atLab.filter((c) => (c.job.lab ?? "") === lab);
            return (
              <li key={lab || "none"}>
                <details className="rounded-lg border border-line bg-surface">
                  <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-3 text-sm font-medium hover:text-accent">
                    <span>{lab ? (LAB_LABEL[lab] ?? lab) : "No lab set"}</span>
                    <span className="text-muted">{rows.length}</span>
                  </summary>
                  <ul className="divide-y divide-line border-t border-line px-3">
                    {rows.map((c) => (
                      <li key={c.job.id} className="py-3 text-sm">
                        <Link href={`/jobs/${c.job.id}`} className="font-medium hover:text-accent">
                          {c.job.name}
                        </Link>
                        <p className="mt-0.5 text-muted">
                          {c.lastDay ? `Photo day ${formatDate(c.lastDay)}` : "No photo day"}
                          {c.daysInStage !== null ? ` · at the lab ${c.daysInStage} ${c.daysInStage === 1 ? "day" : "days"}` : ""}
                        </p>
                        <form action={markDelivered.bind(null, c.job.id)} className="mt-2">
                          <ConfirmButton ask="Mark this job delivered?" className={quiet}>
                            Mark delivered
                          </ConfirmButton>
                        </form>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            );
          })}
        </Column>
      </div>
      {!showAll && emptyColumns.length === columnCount && <Empty>No jobs are in production or at the lab.</Empty>}
      {emptyColumns.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
          {!showAll && emptyColumns.length < columnCount && <span>Nothing in: {emptyColumns.join(", ")}.</span>}
          <Link
            href={showAll ? "/production" : "/production?all=1"}
            className="inline-flex min-h-12 items-center rounded-lg border border-line px-3 font-semibold text-text hover:border-accent hover:text-accent sm:min-h-0 sm:py-1.5"
          >
            {showAll ? "Hide empty columns" : "Show all columns"}
          </Link>
        </p>
      )}
      <p className="mt-3 text-xs text-muted">
        A job moves to the next column when the tasks of its stage are done, and to At the lab when its last task is done. Press Done on a card to finish
        its next task.
      </p>
    </>
  );
}

/** One column of the board: a heading with its count, then its cards. */
function Column({ title, count, showEmpty, children }: { title: string; count: number; showEmpty: boolean; children: ReactNode }) {
  // An empty column is left off the board unless every column was asked for.
  if (!count && !showEmpty) return null;
  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-line bg-surface-2/40 md:max-h-[calc(100dvh-16rem)] md:w-72 md:shrink-0">
      <h2 className="flex items-baseline justify-between gap-2 border-b border-line px-3 py-3 font-display text-base font-semibold uppercase tracking-wider text-muted">
        <span>{title}</span>
        <span className="rounded-full border border-line px-2 text-sm">{count}</span>
      </h2>
      {count ? <ul className="space-y-3 p-3 md:overflow-y-auto">{children}</ul> : <p className="p-3 text-sm text-muted">No jobs here.</p>}
    </section>
  );
}

type FolderSeen = { import_done_at: string | null; upload_done_at: string | null };

function StageCard({ card: c, seen }: { card: BoardCard; seen?: FolderSeen }) {
  return (
    <li className="rounded-lg border border-line bg-surface p-3 text-sm">
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
        {seen?.import_done_at && <Pill tone="ok">Imported</Pill>}
        {seen?.upload_done_at && <Pill tone="ok">On the NAS</Pill>}
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
