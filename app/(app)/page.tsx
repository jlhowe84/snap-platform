import Link from "next/link";
import { requireStaff, hasAnyRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill, Stat, StatusDot } from "@/components/ui";
import { daysBetween, formatDate, formatTime, todayIn } from "@/lib/dates";
import { seasonSortKey } from "@/lib/season";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/labels";
import { setTaskStatus } from "./tasks/actions";

export default async function TodayPage() {
  const viewer = await requireStaff();
  const supabase = await createClient();
  const today = todayIn(viewer.timeZone);

  const [{ data: upcoming }, { data: jobs }] = await Promise.all([
    supabase
      .from("photo_days")
      .select("id, date, start_time, location_name, city, job_id, jobs(name, organizations(name))")
      .gte("date", today)
      .order("date")
      .order("start_time", { nullsFirst: false })
      .limit(12),
    supabase.from("job_overview").select("id, status, season, first_date"),
  ]);

  // My day: what is mine to do, what nobody has picked up, and what waits
  // for a decision. RLS already limits each read to what this role may see.
  const desk = hasAnyRole(viewer, ["owner", "admin", "office", "support"]);
  const [{ data: myTasks }, { count: unassigned }, { count: waiting }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, due_on, job_id, jobs(name)")
      .eq("assignee_id", viewer.id)
      .in("status", ["todo", "in_progress", "waiting"])
      .order("due_on", { nullsFirst: false })
      .order("created_at")
      .limit(12),
    supabase.from("tasks").select("id", { count: "exact", head: true }).is("assignee_id", null).in("status", ["todo", "in_progress", "waiting"]),
    desk
      ? supabase.from("agent_actions").select("id", { count: "exact", head: true }).eq("status", "proposed")
      : Promise.resolve({ count: 0 }),
  ]);

  const all = jobs ?? [];
  const inProduction = all.filter((j) => j.status === "in_production" || j.status === "at_lab").length;
  const planning = all.filter((j) => j.status === "planning").length;
  const seasons = new Map<string, number>();
  for (const j of all) if (j.season) seasons.set(j.season, (seasons.get(j.season) ?? 0) + 1);
  const seasonList = [...seasons.entries()].sort((a, b) => seasonSortKey(b[0]) - seasonSortKey(a[0]));
  const next14 = (upcoming ?? []).filter((d) => daysBetween(today, d.date) <= 14).length;

  return (
    <>
      <PageHeader eyebrow={formatDate(today, { weekday: true })} title={`Hi, ${firstName(viewer.name)}`} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Jobs" value={all.length} hint="Every job you can see" />
        <Stat label="Planning" value={planning} hint="Not yet photographed" />
        <Stat label="In production" value={inProduction} hint="Editing through the lab" />
        <Stat label="Photo days, next 14 days" value={next14} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card
          title={`My tasks (${myTasks?.length ?? 0})`}
          className="xl:col-span-2"
          action={<Link href="/tasks" className="text-sm text-accent hover:underline">All tasks</Link>}
        >
          {myTasks?.length ? (
            <ul className="divide-y divide-line">
              {myTasks.map((t) => {
                const late = !!t.due_on && t.due_on < today;
                const job = t.jobs as { name: string } | null;
                return (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{t.title}</p>
                      {t.job_id && job && (
                        <Link href={`/jobs/${t.job_id}`} className="text-muted hover:text-accent">{job.name}</Link>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {t.due_on && <Pill tone={late ? "risk" : "muted"}>{late ? "Was due" : "Due"} {formatDate(t.due_on)}</Pill>}
                      <form action={setTaskStatus.bind(null, t.id, "done")}>
                        <button className="rounded-lg border border-line px-2.5 py-1 hover:border-accent hover:text-accent">Done</button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>Nothing assigned to you right now.</Empty>
          )}
        </Card>

        <Card title="Needs someone">
          <ul className="space-y-2 text-sm">
            {desk && (
              <li>
                <Link href="/queue" className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-surface-2">
                  <span>Drafts waiting for a decision</span>
                  <Pill tone={waiting ? "warn" : "muted"}>{waiting ?? 0}</Pill>
                </Link>
              </li>
            )}
            <li>
              <Link href="/tasks?view=unassigned" className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-surface-2">
                <span>Tasks nobody has picked up</span>
                <Pill tone={unassigned ? "warn" : "muted"}>{unassigned ?? 0}</Pill>
              </Link>
            </li>
          </ul>
        </Card>

        <Card title="Next photo days" className="xl:col-span-2">
          {upcoming && upcoming.length > 0 ? (
            <ul className="divide-y divide-line">
              {upcoming.map((d) => {
                const job = d.jobs as { name: string; organizations: { name: string } | null } | null;
                return (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <Link href={`/jobs/${d.job_id}`} className="font-medium hover:text-accent">
                        {job?.name ?? "Job"}
                      </Link>
                      <p className="text-sm text-muted">
                        {[job?.organizations?.name, d.location_name, d.city].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p>{formatDate(d.date, { weekday: true })}</p>
                      <p className="text-muted">{formatTime(d.start_time) ?? "Time to confirm"}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>No photo days on the calendar from today on.</Empty>
          )}
        </Card>

        <Card title="Jobs by season">
          {seasonList.length ? (
            <ul className="space-y-2">
              {seasonList.map(([season, count]) => (
                <li key={season}>
                  <Link
                    href={`/jobs?season=${encodeURIComponent(season)}`}
                    className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-surface-2"
                  >
                    <span>{season}</span>
                    <Pill>{count}</Pill>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No jobs yet.</Empty>
          )}
          <div className="mt-4 flex flex-wrap gap-3 border-t border-line pt-4">
            {(["planning", "in_production", "complete"] as const).map((s) => (
              <StatusDot key={s} tone={STATUS_TONE[s]} label={STATUS_LABEL[s]} />
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function firstName(name: string) {
  return name.includes("@") ? name.split("@")[0] : name.split(" ")[0];
}
