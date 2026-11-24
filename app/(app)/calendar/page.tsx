import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, cx } from "@/components/ui";
import { formatDate, formatTime, todayIn } from "@/lib/dates";
import { monthGrid, monthLabel, monthOf, shiftMonth } from "@/lib/calendar";

export const metadata: Metadata = { title: "Calendar" };

const VIEWS = { all: "Everything", mine: "My tasks only", days: "Photo days only" } as const;
type View = keyof typeof VIEWS;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Item = { key: string; href: string; text: string; sub?: string; tone: "day" | "held" | "release" | "task" | "late" | "makeup" };

const TONE: Record<Item["tone"], string> = {
  day: "border-accent/60 bg-accent/15",
  held: "border-warn/60 border-dashed",
  release: "border-line text-muted",
  task: "border-line",
  late: "border-risk/60 text-risk",
  makeup: "border-info/60 bg-info/10",
};

// One calendar: photo days, held dates, the day each hold releases, task due
// dates, and the makeup and retake sessions booked for each day. Every read is the signed-in person's, so RLS decides what shows.
export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const viewer = await requireStaff();
  const sp = await searchParams;
  const today = todayIn(viewer.timeZone);
  const month = monthOf(typeof sp.m === "string" ? sp.m : undefined, today);
  const view: View = typeof sp.view === "string" && sp.view in VIEWS ? (sp.view as View) : "all";
  const grid = monthGrid(month);
  const supabase = await createClient();

  let tasksQuery = supabase
    .from("tasks")
    .select("id, title, due_on, job_id, assignee_id")
    .in("status", ["todo", "in_progress", "waiting"])
    .gte("due_on", grid.from)
    .lte("due_on", grid.to)
    .order("due_on")
    .limit(400);
  if (view === "mine") tasksQuery = tasksQuery.eq("assignee_id", viewer.id);

  const [{ data: days }, { data: holds }, { data: tasks }, { data: capacity }, { data: capSetting }, { data: makeups }] = await Promise.all([
    view === "mine"
      ? Promise.resolve({ data: [] as never[] })
      : supabase
          .from("photo_days")
          .select("id, date, start_time, stations, job_id, jobs!inner(name, status)")
          .eq("status", "scheduled")
          .gte("date", grid.from)
          .lte("date", grid.to)
          .order("start_time", { nullsFirst: false })
          .limit(400),
    view === "all"
      ? supabase.from("date_holds").select("id, job_id, expires_on, jobs(name)").eq("status", "held").gte("expires_on", grid.from).lte("expires_on", grid.to)
      : Promise.resolve({ data: [] as never[] }),
    view === "days" ? Promise.resolve({ data: [] as never[] }) : tasksQuery,
    supabase.from("date_capacity").select("date, stations_used").gte("date", grid.from).lte("date", grid.to),
    supabase.from("settings").select("value").eq("key", "capacity.stations_per_date").maybeSingle(),
    // Only the office and support can read bookings; for anyone else this is empty.
    view === "all"
      ? supabase.from("makeup_bookings").select("date, start_time").eq("status", "booked").gte("date", grid.from).lte("date", grid.to).order("start_time").limit(2000)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const cap = typeof capSetting?.value === "number" ? capSetting.value : 10;
  const used = new Map((capacity ?? []).map((c) => [c.date, c.stations_used ?? 0]));
  const byDate = new Map<string, Item[]>();
  const add = (date: string, item: Item) => byDate.set(date, [...(byDate.get(date) ?? []), item]);

  for (const d of days ?? []) {
    const job = d.jobs as { name: string; status: string } | null;
    if (!job || job.status === "released" || job.status === "cancelled") continue;
    add(d.date, {
      key: `d${d.id}`,
      href: `/jobs/${d.job_id}`,
      text: job.name,
      sub: [job.status === "held" ? "Held" : null, formatTime(d.start_time)].filter(Boolean).join(" · ") || undefined,
      tone: job.status === "held" ? "held" : "day",
    });
  }
  for (const h of holds ?? []) {
    const job = h.jobs as { name: string } | null;
    add(h.expires_on, { key: `h${h.id}`, href: `/jobs/${h.job_id}`, text: `Hold releases: ${job?.name ?? "job"}`, tone: "release" });
  }
  const sessions = new Map<string, { count: number; first: string }>();
  for (const m of makeups ?? []) {
    const seen = sessions.get(m.date);
    sessions.set(m.date, { count: (seen?.count ?? 0) + 1, first: seen?.first ?? m.start_time });
  }
  for (const [date, m] of sessions) {
    add(date, {
      key: `m${date}`,
      href: `/production/makeups?date=${date}`,
      text: `${m.count} makeup or retake session${m.count === 1 ? "" : "s"}`,
      sub: `First at ${formatTime(m.first)}`,
      tone: "makeup",
    });
  }
  for (const t of tasks ?? []) {
    if (!t.due_on) continue;
    add(t.due_on, {
      key: `t${t.id}`,
      href: t.job_id ? `/jobs/${t.job_id}` : "/tasks?view=all",
      text: t.title,
      sub: t.assignee_id === viewer.id ? "Yours" : t.assignee_id ? undefined : "Unassigned",
      tone: t.due_on < today ? "late" : "task",
    });
  }

  const link = (m: string, v: View = view) => `/calendar?m=${m}${v === "all" ? "" : `&view=${v}`}`;
  const quiet = "rounded-lg border border-line px-3 py-1.5 text-sm hover:border-accent hover:text-accent";

  return (
    <>
      <PageHeader eyebrow="Today · Calendar" title={monthLabel(month)}>
        <div className="flex flex-wrap gap-2">
          <Link href={link(shiftMonth(month, -1))} className={quiet}>Previous</Link>
          <Link href={link(today.slice(0, 7))} className={quiet}>This month</Link>
          <Link href={link(shiftMonth(month, 1))} className={quiet}>Next</Link>
        </div>
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link key={v} href={link(month, v)} className={cx(quiet, v === view && "border-accent text-accent")} aria-current={v === view ? "page" : undefined}>
            {VIEWS[v]}
          </Link>
        ))}
      </div>

      <Card className="hidden md:block">
        <div className="grid grid-cols-7 border-b border-line pb-2 text-xs uppercase tracking-wide text-muted">
          {WEEKDAYS.map((w) => <div key={w} className="px-1">{w}</div>)}
        </div>
        {grid.weeks.map((week) => (
          <div key={week[0].date} className="grid grid-cols-7 border-b border-line last:border-b-0">
            {week.map((cell) => {
              const items = byDate.get(cell.date) ?? [];
              const stations = used.get(cell.date) ?? 0;
              return (
                <div key={cell.date} className={cx("min-h-28 border-r border-line p-1.5 last:border-r-0", !cell.inMonth && "opacity-40")}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className={cx("inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1", cell.date === today && "bg-accent font-semibold text-accent-ink")}>
                      {Number(cell.date.slice(8))}
                    </span>
                    {stations > 0 && view !== "mine" && (
                      <span className={cx("text-muted", stations >= cap && "font-semibold text-risk")} title="Photo stations in use">
                        {stations} of {cap}
                      </span>
                    )}
                  </div>
                  <ul className="space-y-1">
                    {items.map((i) => (
                      <li key={i.key}>
                        <Link href={i.href} className={cx("block rounded border px-1.5 py-1 text-xs leading-tight hover:brightness-125", TONE[i.tone])}>
                          <span className="line-clamp-2">{i.text}</span>
                          {i.sub && <span className="block text-[11px] text-muted">{i.sub}</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        ))}
      </Card>

      {/* On a phone the month reads as a list of the days that have something. */}
      <Card className="md:hidden">
        {grid.weeks.flat().filter((c) => c.inMonth && byDate.has(c.date)).length === 0 ? (
          <p className="text-sm text-muted">Nothing on the calendar this month.</p>
        ) : (
          <ul className="divide-y divide-line">
            {grid.weeks.flat().filter((c) => c.inMonth && byDate.has(c.date)).map((c) => (
              <li key={c.date} className="py-3">
                <p className={cx("mb-1 text-sm font-medium", c.date === today && "text-accent")}>
                  {formatDate(c.date, { weekday: true })}
                  {(used.get(c.date) ?? 0) > 0 && view !== "mine" && <span className="font-normal text-muted"> · {used.get(c.date)} of {cap} stations</span>}
                </p>
                <ul className="space-y-1">
                  {(byDate.get(c.date) ?? []).map((i) => (
                    <li key={i.key}>
                      <Link href={i.href} className={cx("block rounded border px-2 py-1.5 text-sm", TONE[i.tone])}>
                        {i.text}
                        {i.sub && <span className="block text-xs text-muted">{i.sub}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-3 text-xs text-muted">
        Filled boxes are photo days, dashed boxes are held dates, blue boxes are makeup and retake sessions, and plain boxes are tasks due. The count in each day is
        photo stations in use out of {cap}. Postponed and cancelled photo days are left off.
      </p>
    </>
  );
}
