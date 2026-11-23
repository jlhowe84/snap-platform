import { daysBetween } from "@/lib/dates";
import { STAGES } from "@/lib/labels";
import type { Database } from "@/lib/database.types";

// The production board, worked out from jobs and their production tasks.
// No network and no database here.

type Stage = Database["public"]["Enums"]["production_stage"];

export type BoardJob = {
  id: string;
  name: string;
  status: string;
  lab: string | null;
  production_stage: Stage | null;
  production_stage_since: string | null;
  production_started_at: string | null;
  /** Photo day dates, any order. */
  days: string[];
};

export type BoardTask = {
  id: string;
  job_id: string;
  title: string;
  status: string;
  due_on: string | null;
  position: number;
};

export type BoardCard = {
  job: BoardJob;
  lastDay: string | null;
  total: number;
  done: number;
  /** The first open task in playbook order. */
  next: BoardTask | null;
  /** Open tasks past their due date. */
  late: number;
  /** Whole days since the job reached its stage, when the platform saw it happen. */
  daysInStage: number | null;
};

export type Board = {
  /** Jobs whose photo days are over and whose production has not started. */
  ready: BoardCard[];
  stages: { stage: Stage; cards: BoardCard[] }[];
  atLab: BoardCard[];
};

const OPEN = new Set(["todo", "in_progress", "waiting"]);
export const WORK_STAGES = STAGES.filter((s) => s !== "complete");

function card(job: BoardJob, tasks: BoardTask[], today: string): BoardCard {
  const mine = tasks.filter((t) => t.status !== "cancelled").sort((a, b) => a.position - b.position);
  const open = mine.filter((t) => OPEN.has(t.status));
  const lastDay = job.days.length ? [...job.days].sort().at(-1)! : null;
  return {
    job,
    lastDay,
    total: mine.length,
    done: mine.length - open.length,
    next: open[0] ?? null,
    late: open.filter((t) => t.due_on && t.due_on < today).length,
    daysInStage: job.production_stage_since ? Math.max(0, daysBetween(job.production_stage_since.slice(0, 10), today)) : null,
  };
}

// Longest wait first; jobs with nothing to go on sort by photo day.
const byWait = (a: BoardCard, b: BoardCard) =>
  (b.daysInStage ?? -1) - (a.daysInStage ?? -1) || (a.lastDay ?? "9").localeCompare(b.lastDay ?? "9") || a.job.name.localeCompare(b.job.name);

export function buildBoard(jobs: BoardJob[], tasks: BoardTask[], today: string): Board {
  const tasksOf = new Map<string, BoardTask[]>();
  for (const t of tasks) tasksOf.set(t.job_id, [...(tasksOf.get(t.job_id) ?? []), t]);
  const cards = jobs.map((j) => card(j, tasksOf.get(j.id) ?? [], today));

  const ready = cards
    .filter((c) => c.job.status === "planning" && c.lastDay !== null && c.lastDay <= today)
    .sort((a, b) => a.lastDay!.localeCompare(b.lastDay!));
  const working = cards.filter((c) => c.job.status === "in_production");
  const stages = WORK_STAGES.map((stage) => ({
    stage,
    // A job in production with no stage yet waits at the first one.
    cards: working.filter((c) => (c.job.production_stage ?? WORK_STAGES[0]) === stage || (stage === WORK_STAGES.at(-1) && c.job.production_stage === "complete")).sort(byWait),
  }));
  const atLab = cards
    .filter((c) => c.job.status === "at_lab")
    .sort((a, b) => (a.lastDay ?? "9").localeCompare(b.lastDay ?? "9") || a.job.name.localeCompare(b.job.name));
  return { ready, stages, atLab };
}
