import { redirect } from "next/navigation";
import Link from "next/link";
import { requireStaff, hasAnyRole, OFFICE_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill, Stat, StatusDot } from "@/components/ui";
import { daysBetween, formatDate, formatTime, todayIn } from "@/lib/dates";
import { seasonSortKey } from "@/lib/season";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/labels";
import { setTaskStatus } from "./tasks/actions";

export default async function TodayPage() {
  const viewer = await requireStaff();
  // Crew with no office role live on their shifts page.
  if (!hasAnyRole(viewer, ["owner", "admin", "office", "support"])) redirect("/shifts");
  const supabase = await createClient();
  const today = todayIn(viewer.timeZone);

  const [{ data: upcoming }, { data: jobs }] = await Promise.all([
    supabase
      .from("photo_days")
      .select("id, date, start_time, location_name, city, job_id, jobs(name, organizations(name)), shifts(status)")
      .gte("date", today)
      .eq("status", "scheduled")
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

  // What is waiting, for the tiles at the top. Each read is limited by RLS to
  // what this role may see, and skipped for roles that cannot open the page.
  const office = hasAnyRole(viewer, OFFICE_ROLES);
  const support = office || viewer.roles.includes("support");
  const soon = (upcoming ?? []).filter((d) => daysBetween(today, d.date) <= 14);
  const [{ count: needReply }, { data: ready }] = await Promise.all([
    support
      ? supabase.from("support_conversations").select("id", { count: "exact", head: true }).in("status", ["new", "open"])
      : Promise.resolve({ count: 0 }),
    soon.length
      ? supabase
          .from("photo_day_readiness")
          .select("photo_day_id, agreement_signed, planning_form, roster, schedule")
          .in("photo_day_id", soon.map((d) => d.id))
      : Promise.resolve({ data: [] as { photo_day_id: string | null; agreement_signed: boolean | null; planning_form: string | null; roster: string | null; schedule: string | null }[] }),
  ]);
  const readyBy = new Map((ready ?? []).map((r) => [r.photo_day_id, r]));
  const crewOf = (d: { shifts: { status: string }[] | null }) => {
    const live = (d.shifts ?? []).filter((x) => x.status !== "cancelled");
    return {
      total: live.length,
      filled: live.filter((x) => x.status === "filled").length,
      drafts: live.filter((x) => x.status === "draft").length,
    };
  };
  const toPublish = soon.reduce((n, d) => n + crewOf(d).drafts, 0);
  const toFill = soon.reduce((n, d) => n + crewOf(d).total - crewOf(d).filled - crewOf(d).drafts, 0);
  const noCrew = soon.filter((d) => crewOf(d).total === 0).length;
  const missing = (r: { agreement_signed: boolean | null; planning_form: string | null; roster: string | null; schedule: string | null } | undefined) =>
    !r
      ? []
      : [
          !r.agreement_signed && "agreement",
          r.planning_form !== "submitted" && "form",
          (!r.roster || r.roster === "not_received") && "roster",
          r.schedule !== "submitted" && r.schedule !== "complete" && "schedule",
        ].filter((x): x is string => !!x);

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

      {/* What needs someone, first. Each tile opens the page where it gets done. */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {support && <Need href="/support" count={needReply ?? 0} label="Support waiting for a reply" />}
        {desk && <Need href="/queue" count={waiting ?? 0} label="Drafts waiting for a decision" />}
        <Need href="/tasks?view=unassigned" count={unassigned ?? 0} label="Tasks nobody has picked up" />
        {office && (
          <Need
            href="/staffing"
            count={toPublish + toFill + noCrew}
            label={
              toPublish + toFill + noCrew
                ? [toPublish && `${toPublish} shifts to publish`, toFill && `${toFill} to fill`, noCrew && `${noCrew} days with no shifts`]
                    .filter(Boolean)
                    .join(", ") + ", next 14 days"
                : "Crew gaps, next 14 days"
            }
          />
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
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
                    {daysBetween(today, d.date) <= 14 && (
                      <div className="flex w-full flex-wrap gap-2">
                        {(() => {
                          const gaps = missing(readyBy.get(d.id));
                          // Nothing at all here usually means the job was planned in Notion.
                          if (gaps.length === 4) return <Pill>Planning not tracked here</Pill>;
                          return gaps.length ? <Pill tone="warn">Missing {gaps.join(", ")}</Pill> : <Pill tone="ok">Planning in</Pill>;
                        })()}
                        {office &&
                          (() => {
                            const c = crewOf(d);
                            return (
                              <Link href={`/staffing/${d.id}`}>
                                <Pill tone={!c.total ? "warn" : c.filled === c.total ? "ok" : c.drafts ? "warn" : "info"}>
                                  {!c.total ? "No shifts yet" : `Crew ${c.filled} of ${c.total}${c.drafts ? `, ${c.drafts} not published` : ""}`}
                                </Pill>
                              </Link>
                            );
                          })()}
                      </div>
                    )}
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

      <h2 className="mb-3 mt-8 font-display text-lg font-semibold uppercase tracking-wider text-muted">The whole book</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Jobs" value={all.length} hint="Every job you can see" />
        <Stat label="Planning" value={planning} hint="Not yet photographed" />
        <Stat label="In production" value={inProduction} hint="Editing through the lab" />
        <Stat label="Photo days, next 14 days" value={next14} />
      </div>
    </>
  );
}

/** One thing waiting: a count that opens the page where it gets done. */
function Need({ href, count, label }: { href: string; count: number; label: string }) {
  return (
    <Link
      href={href}
      className={
        "rounded-xl border p-4 transition-colors hover:border-accent " +
        (count ? "border-accent/50 bg-accent/10" : "border-line bg-surface")
      }
    >
      <p className={"font-display text-4xl font-semibold leading-none " + (count ? "" : "text-muted")}>{count}</p>
      <p className="mt-2 text-sm text-muted">{label}</p>
    </Link>
  );
}

function firstName(name: string) {
  return name.includes("@") ? name.split("@")[0] : name.split(" ")[0];
}
