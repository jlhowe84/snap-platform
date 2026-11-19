import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/dates";
import {
  POSITION_LABEL,
  crewForShift,
  defaultCounts,
  staffingSummary,
  waveLabel,
  type CrewChoice,
  type ShiftStatus,
} from "@/lib/staffing/plan";
import { assignShift, cancelShift, openNextWave, publishShifts, releaseShift } from "../actions";
import { AddShifts } from "./add-shifts";

export const metadata: Metadata = { title: "Staffing" };

const quiet = "rounded-lg border border-line px-2.5 py-1 text-sm hover:border-accent hover:text-accent";
const primary = "rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink hover:brightness-110";
const STATUS_TONE = { draft: "warn", open: "info", filled: "ok", cancelled: "muted" } as const;

export default async function StaffingDayPage({ params }: PageProps<"/staffing/[dayId]">) {
  await requireStaff(OFFICE_ROLES);
  const { dayId } = await params;
  if (!z.uuid().safeParse(dayId).success) notFound();
  const supabase = await createClient();

  const { data: day } = await supabase
    .from("photo_days")
    .select("id, date, start_time, end_time, label, location_name, city, state, stations, indoor, jobs!inner(id, name)")
    .eq("id", dayId)
    .maybeSingle();
  if (!day) notFound();

  const [{ data: shifts }, { data: crew }, { data: busy }] = await Promise.all([
    supabase
      .from("shifts")
      .select("id, position, station, start_time, end_time, status, open_level, filled_by, crew_member_id, crew_members(full_name, level), shift_responses(response)")
      .eq("photo_day_id", dayId)
      .order("position")
      .order("station", { nullsFirst: false })
      .order("created_at"),
    supabase.from("crew_members").select("id, full_name, positions, level, active").eq("active", true).order("full_name"),
    supabase.from("shifts").select("crew_member_id, photo_days!inner(date)").eq("photo_days.date", day.date).eq("status", "filled"),
  ]);

  const list = shifts ?? [];
  const sum = staffingSummary(list as { status: ShiftStatus }[]);
  const busyIds = new Set((busy ?? []).map((b) => b.crew_member_id).filter((v): v is string => !!v));
  const canWiden = list.some((s) => s.status === "open" && s.open_level != null);
  const choices = (crew ?? []) as CrewChoice[];

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/staffing" className="text-muted hover:text-text">Staffing</Link>
      </p>
      <PageHeader eyebrow={formatDate(day.date, { weekday: true })} title={day.jobs.name}>
        <Link href={`/jobs/${day.jobs.id}`} className={quiet}>Open the job</Link>
      </PageHeader>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card title="The day">
          <p>{[formatTime(day.start_time), formatTime(day.end_time)].filter(Boolean).join(" to ") || "No times yet"}</p>
          <p className="text-sm text-muted">{[day.label, day.location_name, day.city, day.state].filter(Boolean).join(", ")}</p>
          <p className="mt-2 text-sm text-muted">
            {day.stations} station{day.stations === 1 ? "" : "s"} · {day.indoor == null ? "Indoor or outdoor not known" : day.indoor ? "Indoors" : "Outdoors"}
          </p>
        </Card>
        <Card title="Shifts">
          <p className="font-display text-4xl font-semibold">{sum.filled} of {sum.total}</p>
          <p className="text-sm text-muted">filled{sum.drafts ? `, ${sum.drafts} not published yet` : ""}</p>
        </Card>
        <Card title="Offers">
          <div className="flex flex-wrap gap-2">
            {sum.drafts > 0 && (
              <form action={publishShifts.bind(null, day.id)}>
                <button className={primary}>Publish to Level 1</button>
              </form>
            )}
            {canWiden && (
              <form action={openNextWave.bind(null, day.id)}>
                <button className={quiet}>Open to the next Level</button>
              </form>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">
            Level 1 crew see a published shift first. Open it to the next Level when nobody has taken it, until it is open to everyone.
          </p>
        </Card>
      </div>

      <Card title="Shifts" className="mb-6">
        {!list.length ? (
          <Empty>No shifts yet. Add them below.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((s) => {
              const declines = (s.shift_responses ?? []).filter((r) => r.response === "declined").length;
              const status = s.status as ShiftStatus;
              const options = crewForShift(choices, s.position, busyIds);
              return (
                <li key={s.id} className="grid gap-2 px-2 py-3 md:grid-cols-[1.2fr_1.3fr_2fr] md:items-center">
                  <div>
                    <p className="font-medium">
                      {POSITION_LABEL[s.position] ?? s.position}
                      {s.station != null && <span className="text-muted"> · station {s.station}</span>}
                    </p>
                    <p className="text-sm text-muted">{[formatTime(s.start_time), formatTime(s.end_time)].filter(Boolean).join(" to ") || "Day's times"}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={STATUS_TONE[status]}>{waveLabel(status, s.open_level)}</Pill>
                    {s.crew_members && (
                      <span className="text-sm">
                        {s.crew_members.full_name}
                        {s.filled_by === "crew" && <span className="text-muted"> (took it)</span>}
                      </span>
                    )}
                    {declines > 0 && <span className="text-xs text-muted">{declines} declined</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    {(status === "draft" || status === "open") && (
                      <form action={assignShift.bind(null, day.id, s.id)} className="flex items-center gap-1">
                        <select name="crew_member_id" required defaultValue="" aria-label="Crew member" className="max-w-48 rounded-lg border border-line bg-surface px-2 py-1 text-sm">
                          <option value="" disabled>Choose…</option>
                          {options.map((c) => (
                            <option key={c.id} value={c.id} disabled={c.busy}>
                              {c.full_name}{c.level != null ? ` (L${c.level})` : ""}{c.busy ? ", busy that day" : ""}
                            </option>
                          ))}
                        </select>
                        <button className={quiet}>Assign</button>
                      </form>
                    )}
                    {status === "filled" && (
                      <form action={releaseShift.bind(null, day.id, s.id)}>
                        <button className={quiet}>Take off and reopen</button>
                      </form>
                    )}
                    {status !== "cancelled" && (
                      <form action={cancelShift.bind(null, day.id, s.id)}>
                        <button className={quiet}>{status === "draft" ? "Remove" : "Cancel"}</button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Add shifts">
        <AddShifts
          dayId={day.id}
          counts={sum.total ? { photographer: 0, poser: 0, coordinator: 0, photo_attendant: 0 } : defaultCounts(day.stations)}
          start={day.start_time}
          end={day.end_time}
          stations={day.stations}
        />
      </Card>
    </>
  );
}
