import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Empty, PageHeader, Pill, cx } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/dates";
import { readAnswers } from "@/lib/planning/form";
import { portalJob } from "@/lib/portal/job";
import { knownNotice } from "@/lib/schedule/notices";
import { nextFree, toClock, toMinutes, type Slot } from "@/lib/schedule/layout";
import {
  addSlot,
  addTeam,
  placeRest,
  removeSlot,
  removeTeam,
  saveSetup,
  setScheduleStatus,
  startSchedule,
  submitSchedule,
  updateSlot,
  updateTeam,
} from "./actions";

const input = "rounded-lg border border-line bg-bg px-2 py-1.5 text-sm text-text focus:border-accent focus:outline-none";
const primary = "rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110";
const quiet = "rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-2";
const MINUTES = [5, 10, 15, 20, 25, 30, 40, 45, 50, 60];

const PROBLEM: Record<string, (d: string | null) => string> = {
  missing_team: (d) => `${d} has no time slot.`,
  overlap: (d) => `Two slots overlap on ${d?.replace(/(\d{2}:\d{2})$/, (t) => formatTime(t) ?? t)}.`,
  station_out_of_range: (d) => `A slot is on ${d}, which is not set up for this day.`,
  no_teams: () => "Add your teams first.",
};
const STATUS: Record<string, string> = {
  not_started: "Not started", link_sent: "Not started", started: "In progress", submitted: "Submitted", complete: "Complete",
};

export default async function SchedulePage({ params, searchParams }: PageProps<"/portal/[jobId]/schedule">) {
  const { jobId } = await params;
  const query = await searchParams;
  const ctx = await portalJob(jobId);
  if (!ctx) notFound();
  const { supabase, canEdit, office } = ctx;

  const [{ data: days }, { data: teams }, { data: form }] = await Promise.all([
    supabase.from("photo_days").select("id, date, start_time, location_name").eq("job_id", jobId).order("date").order("start_time"),
    supabase.from("teams").select("id, name, division, coach_name, sponsor, player_count, tc_number, source").eq("job_id", jobId).order("division").order("name"),
    supabase.from("planning_forms").select("answers").eq("job_id", jobId).maybeSingle(),
  ]);
  const wanted = typeof query.day === "string" ? query.day : null;
  const day = days?.find((d) => d.id === wanted) ?? days?.[0];
  const notice = knownNotice(query.notice);

  // The schedule row is made the first time someone who may edit opens it.
  if (day && canEdit && !ctx.viewer.staff) await supabase.rpc("open_schedule", { p_photo_day_id: day.id });
  const { data: schedule } = day
    ? await supabase.from("schedules").select("id, status, stations, default_block_minutes, submitted_at").eq("photo_day_id", day.id).maybeSingle()
    : { data: null };
  const [{ data: slotRows }, { data: allSlots }, { data: problems }] = schedule
    ? await Promise.all([
        supabase.from("schedule_slots").select("id, station, starts_at, minutes, kind, team_id, label").eq("schedule_id", schedule.id).order("starts_at"),
        supabase.from("schedule_slots").select("team_id").eq("job_id", jobId),
        supabase.rpc("schedule_problems", { p_schedule_id: schedule.id }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const slots = (slotRows ?? []) as (Slot & { id: string })[];
  const placed = new Set((allSlots ?? []).map((s) => s.team_id));
  const unplaced = (teams ?? []).filter((t) => !placed.has(t.id));
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.division ? `${t.name} (${t.division})` : t.name]));
  const start = (day?.start_time ?? readAnswers(form?.answers).first_group_time ?? "09:00").slice(0, 5);
  const stations = schedule?.stations ?? 2;
  const free = nextFree(slots, stations, start);
  const soonest = free.indexOf(Math.min(...free));
  const done = schedule?.status === "submitted" || schedule?.status === "complete";
  const dayId = day?.id ?? null;

  return (
    <>
      <Link href={`/portal/${jobId}`} className="text-sm text-muted underline-offset-2 hover:underline">
        Back to your steps
      </Link>
      <PageHeader eyebrow={ctx.job.name} title="Picture day schedule">
        {schedule && <Pill tone={done ? "ok" : "warn"}>{STATUS[schedule.status] ?? schedule.status}</Pill>}
      </PageHeader>

      {notice && <p className="mb-4 rounded-lg border border-line bg-surface-2 p-3 text-sm">{notice}</p>}
      {!canEdit && !ctx.viewer.staff && (
        <p className="mb-6 rounded-lg border border-line p-4 text-sm text-muted">
          {ctx.signed ? "This photo day is closed, so the schedule can no longer be changed." : "This step opens once the agreement is signed."}
        </p>
      )}

      <Card title={`Teams (${teams?.length ?? 0})`} className="mb-6">
        <p className="mb-3 text-sm text-muted">
          List every team or group that will be photographed. Teams from your roster appear here once we have read it.
        </p>
        {teams?.length ? (
          <ul className="divide-y divide-line">
            {teams.map((t) => (
              <li key={t.id} className="py-2">
                {canEdit ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <form action={updateTeam.bind(null, jobId, dayId, t.id)} className="flex flex-1 flex-wrap items-end gap-2">
                      <input name="name" defaultValue={t.name} required maxLength={120} aria-label="Team name" className={cx(input, "min-w-36 flex-1")} />
                      <input name="division" defaultValue={t.division ?? ""} maxLength={80} placeholder="Division" aria-label="Division" className={cx(input, "w-28")} />
                      <input name="coach_name" defaultValue={t.coach_name ?? ""} maxLength={120} placeholder="Coach" aria-label="Coach" className={cx(input, "w-32")} />
                      <input name="sponsor" defaultValue={t.sponsor ?? ""} maxLength={160} placeholder="Sponsor" aria-label="Sponsor" className={cx(input, "w-32")} />
                      <input name="player_count" type="number" min={0} max={500} defaultValue={t.player_count ?? ""} placeholder="Players" aria-label="Players" className={cx(input, "w-20")} />
                      {office && <input name="tc_number" defaultValue={t.tc_number ?? ""} maxLength={20} placeholder="TC" aria-label="Team card number" className={cx(input, "w-16")} />}
                      <button className={quiet}>Save</button>
                    </form>
                    <form action={removeTeam.bind(null, jobId, dayId, t.id)}>
                      <button className="px-2 py-1.5 text-sm text-muted hover:text-risk" aria-label={`Remove ${t.name}`}>Remove</button>
                    </form>
                  </div>
                ) : (
                  <p className="text-sm">
                    <span className="font-medium">{t.name}</span>
                    <span className="text-muted">{[t.division, t.coach_name, t.sponsor].filter(Boolean).map((x) => ` · ${x}`).join("")}</span>
                  </p>
                )}
                {!placed.has(t.id) && <p className="mt-1 text-xs text-warn">No time slot yet</p>}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No teams yet.</Empty>
        )}
        {canEdit && (
          <form action={addTeam.bind(null, jobId, dayId)} className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
            <input name="name" required maxLength={120} placeholder="New team name" aria-label="New team name" className={cx(input, "min-w-36 flex-1")} />
            <input name="division" maxLength={80} placeholder="Division" aria-label="Division" className={cx(input, "w-28")} />
            <input name="coach_name" maxLength={120} placeholder="Coach" aria-label="Coach" className={cx(input, "w-32")} />
            <input name="sponsor" maxLength={160} placeholder="Sponsor" aria-label="Sponsor" className={cx(input, "w-32")} />
            <input name="player_count" type="number" min={0} max={500} placeholder="Players" aria-label="Players" className={cx(input, "w-20")} />
            <button className={primary}>Add team</button>
          </form>
        )}
      </Card>

      {(days?.length ?? 0) > 1 && (
        <nav className="mb-4 flex flex-wrap gap-2" aria-label="Photo days">
          {days!.map((d) => (
            <Link
              key={d.id}
              href={`/portal/${jobId}/schedule?day=${d.id}`}
              className={cx("rounded-lg border px-3 py-1.5 text-sm", d.id === day?.id ? "border-accent bg-surface-2 font-semibold" : "border-line hover:bg-surface-2")}
            >
              {formatDate(d.date, { weekday: true })}
            </Link>
          ))}
        </nav>
      )}

      {!day ? (
        <Empty>No photo day is set for this job yet.</Empty>
      ) : !schedule ? (
        <div>
          <Empty>The schedule has not been started.</Empty>
          {office && canEdit && (
            <form action={startSchedule.bind(null, jobId, day.id)} className="mt-3">
              <button className={quiet}>Office: start this schedule</button>
            </form>
          )}
        </div>
      ) : (
        <Card
          title={`${formatDate(day.date, { weekday: true })}${day.location_name ? ` · ${day.location_name}` : ""}`}
          action={
            <a href={`/portal/${jobId}/schedule/csv?day=${day.id}`} className="text-sm text-accent hover:underline">
              Download CSV
            </a>
          }
        >
          <p className="mb-4 text-sm text-muted">
            {stations} {stations === 1 ? "station" : "stations"}, each photographing one team at a time. First group at {formatTime(start)}.
            Blocks are {schedule.default_block_minutes} minutes unless you change one.
          </p>

          {office && (
            <form action={saveSetup.bind(null, jobId, day.id, schedule.id)} className="mb-4 flex flex-wrap items-end gap-2 rounded-lg bg-surface-2 p-3 text-sm">
              <span className="text-xs uppercase tracking-wider text-muted">Office</span>
              <label>
                Stations{" "}
                <input name="stations" type="number" min={1} max={20} defaultValue={stations} className={cx(input, "w-16")} />
              </label>
              <label>
                Block{" "}
                <select name="default_block_minutes" defaultValue={schedule.default_block_minutes} className={input}>
                  {MINUTES.map((m) => <option key={m} value={m}>{m} min</option>)}
                </select>
              </label>
              <button className={quiet}>Save setup</button>
            </form>
          )}

          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(stations, 3)}, minmax(0, 1fr))` }}>
            {Array.from({ length: stations }, (_, i) => i + 1).map((n) => {
              const mine = slots.filter((s) => s.station === n).sort((a, b) => toMinutes(a.starts_at) - toMinutes(b.starts_at));
              return (
                <section key={n} className="rounded-lg border border-line p-3">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Station {n}</h3>
                  {mine.length === 0 && <p className="text-sm text-muted">Nothing yet.</p>}
                  <ul className="space-y-2">
                    {mine.map((s) => (
                      <li key={s.id} className={cx("rounded-lg p-2 text-sm", s.kind === "break" ? "bg-surface-2 text-muted" : "bg-surface-2")}>
                        <p className="font-medium">
                          {formatTime(s.starts_at)} to {formatTime(toClock(toMinutes(s.starts_at) + s.minutes))}
                          {" · "}
                          {s.kind === "break" ? s.label || "Break" : (teamName.get(s.team_id ?? "") ?? s.label ?? "Team removed")}
                        </p>
                        {canEdit && (
                          <div className="mt-2 flex flex-wrap items-center gap-1">
                            <form action={updateSlot.bind(null, jobId, day.id, s.id)} className="flex flex-wrap items-center gap-1">
                              <input name="starts_at" type="time" step={300} defaultValue={s.starts_at.slice(0, 5)} required aria-label="Start time" className={input} />
                              <select name="minutes" defaultValue={s.minutes} aria-label="Minutes" className={input}>
                                {MINUTES.map((m) => <option key={m} value={m}>{m} min</option>)}
                              </select>
                              <select name="station" defaultValue={s.station} aria-label="Station" className={input}>
                                {Array.from({ length: Math.max(stations, s.station) }, (_, k) => k + 1).map((k) => <option key={k} value={k}>Station {k}</option>)}
                              </select>
                              <button className={quiet}>Move</button>
                            </form>
                            <form action={removeSlot.bind(null, jobId, day.id, s.id)}>
                              <button className="px-2 py-1.5 text-sm text-muted hover:text-risk">Remove</button>
                            </form>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
          {slots.some((s) => s.station > stations) && (
            <p className="mt-3 text-sm text-risk">
              {slots.filter((s) => s.station > stations).length} slot(s) sit on a station that is no longer set up. Ask our office to move them.
            </p>
          )}

          {canEdit && (
            <div className="mt-6 space-y-3 border-t border-line pt-4">
              {unplaced.length > 0 && (
                <>
                  <form action={placeRest.bind(null, jobId, day.id, schedule.id, start)} className="flex flex-wrap items-center gap-3">
                    <button className={primary}>Place the {unplaced.length} remaining {unplaced.length === 1 ? "team" : "teams"} for me</button>
                    <span className="text-xs text-muted">Fills the next open times in order. You can move anything afterwards.</span>
                  </form>
                  <form action={addSlot.bind(null, jobId, day.id, schedule.id, "team")} className="flex flex-wrap items-end gap-2">
                    <select name="team_id" required aria-label="Team" className={cx(input, "min-w-40")}>
                      {unplaced.map((t) => <option key={t.id} value={t.id}>{teamName.get(t.id)}</option>)}
                    </select>
                    <select name="station" defaultValue={soonest + 1} aria-label="Station" className={input}>
                      {Array.from({ length: stations }, (_, k) => k + 1).map((k) => <option key={k} value={k}>Station {k}</option>)}
                    </select>
                    <input name="starts_at" type="time" step={300} defaultValue={toClock(free[soonest])} required aria-label="Start time" className={input} />
                    <select name="minutes" defaultValue={schedule.default_block_minutes} aria-label="Minutes" className={input}>
                      {MINUTES.map((m) => <option key={m} value={m}>{m} min</option>)}
                    </select>
                    <button className={quiet}>Add slot</button>
                  </form>
                </>
              )}
              <form action={addSlot.bind(null, jobId, day.id, schedule.id, "break")} className="flex flex-wrap items-end gap-2">
                <input name="label" maxLength={80} placeholder="Break" aria-label="Break label" className={cx(input, "w-40")} />
                <select name="station" defaultValue={soonest + 1} aria-label="Station" className={input}>
                  {Array.from({ length: stations }, (_, k) => k + 1).map((k) => <option key={k} value={k}>Station {k}</option>)}
                </select>
                <input name="starts_at" type="time" step={300} defaultValue={toClock(free[soonest])} required aria-label="Start time" className={input} />
                <select name="minutes" defaultValue={15} aria-label="Minutes" className={input}>
                  {MINUTES.map((m) => <option key={m} value={m}>{m} min</option>)}
                </select>
                <button className={quiet}>Add break</button>
              </form>
            </div>
          )}

          <div className="mt-6 border-t border-line pt-4">
            {problems?.length ? (
              <>
                <p className="text-sm font-semibold">Before you can submit:</p>
                <ul className="mt-1 list-disc pl-5 text-sm text-muted">
                  {problems.slice(0, 12).map((p, i) => (
                    <li key={i}>{PROBLEM[p.problem]?.(p.detail) ?? p.problem}</li>
                  ))}
                  {problems.length > 12 && <li>and {problems.length - 12} more.</li>}
                </ul>
              </>
            ) : done ? (
              <p className="text-sm text-ok">
                {schedule.status === "complete" ? "Checked and complete." : "Submitted. Every team has a slot and nothing overlaps."} A change you make
                here reopens it, so submit again afterwards.
              </p>
            ) : (
              <p className="text-sm text-ok">Every team has a slot and nothing overlaps. Ready to submit.</p>
            )}
            {canEdit && !done && (
              <form action={submitSchedule.bind(null, jobId, day.id, schedule.id)} className="mt-3">
                <button disabled={!!problems?.length} className={cx(primary, "disabled:cursor-not-allowed disabled:opacity-50")}>
                  Submit schedule
                </button>
              </form>
            )}
            {office && canEdit && (
              <div className="mt-3 flex gap-2">
                {schedule.status === "submitted" && (
                  <form action={setScheduleStatus.bind(null, jobId, day.id, schedule.id, "complete")}>
                    <button className={quiet}>Office: mark complete</button>
                  </form>
                )}
                {done && (
                  <form action={setScheduleStatus.bind(null, jobId, day.id, schedule.id, "started")}>
                    <button className={quiet}>Office: send back</button>
                  </form>
                )}
              </div>
            )}
          </div>
        </Card>
      )}
    </>
  );
}
