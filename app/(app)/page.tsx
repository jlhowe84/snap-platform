import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill, Stat, StatusDot } from "@/components/ui";
import { daysBetween, formatDate, formatTime, todayIn } from "@/lib/dates";
import { seasonSortKey } from "@/lib/season";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/labels";

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
