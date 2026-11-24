import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill, cx } from "@/components/ui";
import { formatDate, todayIn } from "@/lib/dates";
import { assignTask, setTaskStatus } from "./actions";
import { NewTask } from "./new-task";
import { SubmitButton } from "@/components/submit-button";

export const metadata: Metadata = { title: "Tasks" };

const VIEWS = { mine: "Mine", unassigned: "Unassigned", all: "Everyone's", done: "Done" } as const;
type View = keyof typeof VIEWS;
const STATUS: Record<string, string> = { todo: "To do", in_progress: "In progress", waiting: "Waiting", done: "Done", cancelled: "Cancelled" };
const quiet = "rounded-lg border border-line px-2.5 py-1 text-sm hover:border-accent hover:text-accent";

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const viewer = await requireStaff();
  const sp = await searchParams;
  const view: View = typeof sp.view === "string" && sp.view in VIEWS ? (sp.view as View) : "mine";
  const supabase = await createClient();
  const today = todayIn(viewer.timeZone);

  let query = supabase
    .from("tasks")
    .select("id, title, notes, status, due_on, completed_at, assignee_id, job_id, jobs(name)")
    .limit(200);
  if (view === "done") query = query.eq("status", "done").order("completed_at", { ascending: false });
  else {
    query = query.in("status", ["todo", "in_progress", "waiting"]).order("due_on", { nullsFirst: false }).order("created_at");
    if (view === "mine") query = query.eq("assignee_id", viewer.id);
    if (view === "unassigned") query = query.is("assignee_id", null);
  }
  const [{ data: tasks }, { data: staff }] = await Promise.all([
    query,
    supabase.from("profiles").select("id, full_name, email, active, profile_roles(role)").eq("active", true).order("full_name"),
  ]);
  const people = (staff ?? [])
    .filter((p) => (p.profile_roles as { role: string }[]).some((r) => r.role !== "coordinator"))
    .map((p) => ({ id: p.id, name: p.full_name ?? p.email }));
  const nameOf = new Map(people.map((p) => [p.id, p.name]));

  return (
    <>
      <PageHeader eyebrow="Today" title="Tasks" />
      <Card title="New task" className="mb-6">
        <NewTask people={people} me={viewer.id} />
      </Card>

      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link
            key={v}
            href={v === "mine" ? "/tasks" : `/tasks?view=${v}`}
            className={cx("rounded-full border px-3 py-1", v === view ? "border-accent text-accent" : "border-line text-muted hover:text-text")}
          >
            {VIEWS[v]}
          </Link>
        ))}
      </nav>

      <Card title={`${VIEWS[view]} (${tasks?.length ?? 0})`}>
        {tasks?.length ? (
          <ul className="divide-y divide-line">
            {tasks.map((t) => {
              const late = t.status !== "done" && t.due_on && t.due_on < today;
              const job = t.jobs as { name: string } | null;
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className={cx("font-medium", t.status === "done" && "text-muted line-through")}>{t.title}</p>
                    <p className="text-muted">
                      {[
                        job && t.job_id ? job.name : null,
                        t.notes,
                        t.assignee_id ? (nameOf.get(t.assignee_id) ?? "Someone") : "Nobody yet",
                      ].filter(Boolean).join(" · ")}
                    </p>
                    {t.job_id && <Link href={`/jobs/${t.job_id}`} className="text-xs text-accent hover:underline">Open the job</Link>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {t.status !== "done" && t.status !== "todo" && <Pill>{STATUS[t.status]}</Pill>}
                    {t.due_on && <Pill tone={late ? "risk" : "muted"}>{late ? "Was due" : "Due"} {formatDate(t.due_on)}</Pill>}
                    {t.status === "done" ? (
                      <form action={setTaskStatus.bind(null, t.id, "todo")}><SubmitButton className={quiet}>Reopen</SubmitButton></form>
                    ) : (
                      <>
                        <form action={assignTask.bind(null, t.id)} className="flex items-center gap-1">
                          <select key={String(t.assignee_id ?? "")} name="assignee_id" defaultValue={t.assignee_id ?? ""} aria-label="Assigned to" className="rounded-lg border border-line bg-surface px-2 py-1 text-sm">
                            <option value="">Nobody yet</option>
                            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                          <SubmitButton className={quiet}>Assign</SubmitButton>
                        </form>
                        <form action={setTaskStatus.bind(null, t.id, "done")}>
                          <SubmitButton className="rounded-lg bg-accent px-3 py-1 text-sm font-semibold text-accent-ink hover:brightness-110">Done</SubmitButton>
                        </form>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>{view === "mine" ? "Nothing assigned to you." : "Nothing here."}</Empty>
        )}
      </Card>
    </>
  );
}
