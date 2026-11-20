import type { Metadata } from "next";
import Link from "next/link";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import { formatDate, formatTime, todayIn } from "@/lib/dates";
import { staffingSummary, type ShiftStatus } from "@/lib/staffing/plan";

export const metadata: Metadata = { title: "Staffing" };

// Every coming photo day with how many of its shifts are filled. Imported
// Notion jobs show here too; they simply have no shifts until the office adds them.
export default async function StaffingPage() {
  const viewer = await requireStaff(OFFICE_ROLES);
  const supabase = await createClient();
  const today = todayIn(viewer.timeZone);
  const { data: days, error } = await supabase
    .from("photo_days")
    .select("id, date, start_time, end_time, label, city, stations, status, jobs!inner(id, name, status), shifts(status)")
    .gte("date", today)
    .neq("status", "cancelled")
    .not("jobs.status", "in", "(cancelled,released,archived)")
    .order("date")
    .order("start_time")
    .limit(200);

  return (
    <>
      <PageHeader eyebrow="People" title="Staffing" />
      <Card>
        {error ? (
          <Empty>Could not load photo days: {error.message}</Empty>
        ) : !days?.length ? (
          <Empty>No photo days coming up.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {days.map((d) => {
              const s = staffingSummary((d.shifts ?? []) as { status: ShiftStatus }[]);
              const tone = !s.total ? "muted" : s.filled === s.total ? "ok" : s.drafts ? "warn" : "info";
              const label = !s.total
                ? "No shifts yet"
                : `${s.filled} of ${s.total} filled${s.drafts ? `, ${s.drafts} not published` : ""}`;
              return (
                <li key={d.id}>
                  <Link href={`/staffing/${d.id}`} className="grid gap-1 px-2 py-3 hover:bg-surface-2 md:grid-cols-[9rem_1fr_auto] md:items-center">
                    <span className="text-sm">
                      {formatDate(d.date, { weekday: true })}
                      <span className="block text-muted">{[formatTime(d.start_time), formatTime(d.end_time)].filter(Boolean).join(" to ")}</span>
                    </span>
                    <span>
                      <span className="font-medium">{d.jobs.name}</span>
                      {d.status === "postponed" && <> <Pill tone="warn">Postponed</Pill></>}
                      <span className="block text-sm text-muted">
                        {[d.label, d.city, `${d.stations} station${d.stations === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <Pill tone={tone}>{label}</Pill>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
