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
  swapSlots,
  updateSlot,
  updateTeam,
} from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { DraggableSlot } from "./swap-drag";

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

// Team rows line up as one table row each on a wide screen. On a phone the
// fields stack two to a row, each with its own small label.
// This page asks the portal for its wide layout, so the columns fit from 1024px up.
const TEAM_GRID = "grid grid-cols-2 items-end gap-2 lg:grid-cols-[3.5rem_minmax(10rem,1fr)_8rem_10rem_9rem_4rem_3.5rem_1.75rem] lg:gap-1.5 lg:items-center";

function Field({ label, wide, always, children }: { label: string; wide?: boolean; always?: boolean; children: React.ReactNode }) {
  return (
    <label className={cx("flex min-w-0 flex-col gap-0.5", wide && "col-span-2 lg:col-span-1")}>
      <span className={cx("text-xs text-muted", !always && "lg:hidden")}>{label}</span>
      {children}
    </label>
  );
}

function dayName(d: { label: string | null; location_name: string | null; start_time: string | null }): string {
  return d.label?.trim() || d.location_name?.trim() || (d.start_time ? (formatTime(d.start_time) ?? "") : "");
}

export default async function SchedulePage({ params, searchParams }: PageProps<"/portal/[jobId]/schedule">) {
  const { jobId } = await params;
  const query = await searchParams;
  const ctx = await portalJob(jobId);
  if (!ctx) notFound();
  const { supabase, canEdit, office } = ctx;

  const [{ data: days }, { data: teams }, { data: form }] = await Promise.all([
    supabase.from("photo_days").select("id, date, start_time, label, location_name").eq("job_id", jobId).order("date").order("start_time"),
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
  // A slot picked with the Swap button waits in the address bar for its partner.
  const picked = typeof query.swap === "string" && slots.some((s) => s.id === query.swap) ? query.swap : null;

  return (
    <>
      {/* Asks the portal layout for a wider page, so team names have room. */}
      <span data-wide hidden />
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
          List every team or group that will be photographed. Teams from your roster appear here once we have processed it.
        </p>
        {teams?.length ? (
          <>
            {canEdit && (
              <div className={cx(TEAM_GRID, "hidden border-b border-line pb-1 text-xs font-semibold uppercase tracking-wider text-muted lg:grid")}>
                <span>TC #</span>
                <span>Team name</span>
                <span>Division</span>
                <span>Coach</span>
                <span>Sponsor</span>
                <span>Players</span>
                <span className="col-span-2" />
              </div>
            )}
            <ul className="divide-y divide-line">
              {teams.map((t) => (
                <li key={t.id} className="py-2">
                  {canEdit ? (
                    <div className={TEAM_GRID}>
                      <form action={updateTeam.bind(null, jobId, dayId, t.id)} className="contents">
                        <Field label="TC #">
                          {office ? (
                            <input name="tc_number" defaultValue={t.tc_number ?? ""} maxLength={20} aria-label="Team card number" className={cx(input, "w-full")} />
                          ) : (
                            <span className="px-2 py-1.5 text-sm text-muted">{t.tc_number ?? "None"}</span>
                          )}
                        </Field>
                        <Field label="Team name" wide>
                          <input name="name" defaultValue={t.name} required maxLength={120} aria-label="Team name" className={cx(input, "w-full")} />
                        </Field>
                        <Field label="Division">
                          <input name="division" defaultValue={t.division ?? ""} maxLength={80} aria-label="Division" className={cx(input, "w-full")} />
                        </Field>
                        <Field label="Coach">
                          <input name="coach_name" defaultValue={t.coach_name ?? ""} maxLength={120} aria-label="Coach" className={cx(input, "w-full")} />
                        </Field>
                        <Field label="Sponsor">
                          <input name="sponsor" defaultValue={t.sponsor ?? ""} maxLength={160} aria-label="Sponsor" className={cx(input, "w-full")} />
                        </Field>
                        <Field label="Players">
                          <input name="player_count" type="number" min={0} max={500} defaultValue={t.player_count ?? ""} aria-label="Players" className={cx(input, "w-full")} />
                        </Field>
                        <SubmitButton className={cx(quiet, "self-end lg:self-auto lg:px-2")}>Save</SubmitButton>
                      </form>
                      <form action={removeTeam.bind(null, jobId, dayId, t.id)} className="self-end lg:self-auto">
                        <SubmitButton className="px-1.5 py-1.5 text-sm text-muted hover:text-risk" aria-label={`Remove ${t.name}`} title="Remove this team">
                          <span className="lg:hidden">Remove</span>
                          <span aria-hidden className="hidden text-base leading-none lg:inline">×</span>
                        </SubmitButton>
                      </form>
                      {!placed.has(t.id) && <p className="col-span-full text-xs text-warn">No time slot yet</p>}
                    </div>
                  ) : (
                    <>
                      <p className="text-sm">
                        {t.tc_number && <span className="mr-2 rounded border border-line px-1.5 py-0.5 text-xs font-semibold">TC {t.tc_number}</span>}
                        <span className="font-medium">{t.name}</span>
                        <span className="text-muted">{[t.division, t.coach_name, t.sponsor].filter(Boolean).map((x) => ` · ${x}`).join("")}</span>
                      </p>
                      {!placed.has(t.id) && <p className="mt-1 text-xs text-warn">No time slot yet</p>}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <Empty>No teams yet.</Empty>
        )}
        {canEdit && (
          <form action={addTeam.bind(null, jobId, dayId)} className={cx(TEAM_GRID, "mt-4 border-t border-line pt-4")}>
            <p className="col-span-full text-sm font-semibold">Add a team</p>
            <span className="hidden lg:block" />
            <Field label="Team name" wide always>
              <input name="name" required maxLength={120} aria-label="New team name" className={cx(input, "w-full")} />
            </Field>
            <Field label="Division" always>
              <input name="division" maxLength={80} aria-label="Division" className={cx(input, "w-full")} />
            </Field>
            <Field label="Coach" always>
              <input name="coach_name" maxLength={120} aria-label="Coach" className={cx(input, "w-full")} />
            </Field>
            <Field label="Sponsor" always>
              <input name="sponsor" maxLength={160} aria-label="Sponsor" className={cx(input, "w-full")} />
            </Field>
            <Field label="Players" always>
              <input name="player_count" type="number" min={0} max={500} aria-label="Players" className={cx(input, "w-full")} />
            </Field>
            <SubmitButton className={cx(primary, "col-span-2 self-end whitespace-nowrap")}>Add team</SubmitButton>
          </form>
        )}
      </Card>

      {(days?.length ?? 0) > 1 && (
        <nav className="mb-4 flex flex-wrap gap-2" aria-label="Photo days">
          {days!.map((d) => (
            <Link
              key={d.id}
              href={`/portal/${jobId}/schedule?day=${d.id}`}
              className={cx("flex min-h-12 max-w-full flex-col justify-center rounded-lg border px-3 py-1.5 text-sm", d.id === day?.id ? "border-accent bg-surface-2" : "border-line hover:bg-surface-2")}
            >
              <span className={d.id === day?.id ? "font-semibold" : undefined}>{formatDate(d.date, { weekday: true })}</span>
              {/* Days on the same date are told apart by their label, or the place or start time when there is none. */}
              {dayName(d) && <span className="text-xs text-muted">{dayName(d)}</span>}
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
              <SubmitButton className={quiet}>Office: start this schedule</SubmitButton>
            </form>
          )}
        </div>
      ) : (
        <Card
          title={`${formatDate(day.date, { weekday: true })}${dayName(day) ? ` · ${dayName(day)}` : ""}`}
          action={
            <span className="flex gap-4">
              <Link href={`/portal/${jobId}/schedule/print?day=${day.id}`} className="text-sm text-accent hover:underline">
                Print view
              </Link>
              <a href={`/portal/${jobId}/schedule/csv?day=${day.id}`} className="text-sm text-accent hover:underline">
                Download CSV
              </a>
            </span>
          }
        >
          <p className="mb-4 text-sm text-muted">
            {stations} {stations === 1 ? "station" : "stations"}, each photographing one team at a time. First group at {formatTime(start)}.
            Blocks are {schedule.default_block_minutes} minutes unless you change one.
          </p>

          {office && (
            <form action={saveSetup.bind(null, jobId, day.id, schedule.id)} className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-surface-2 p-3 text-sm">
              <span className="text-xs uppercase tracking-wider text-muted">Office</span>
              <label className="flex items-center gap-2">
                Stations
                <input name="stations" type="number" min={1} max={20} defaultValue={stations} className={cx(input, "w-16")} />
              </label>
              <label className="flex items-center gap-2">
                Block
                <select key={String(schedule.default_block_minutes)} name="default_block_minutes" defaultValue={schedule.default_block_minutes} className={input}>
                  {MINUTES.map((m) => <option key={m} value={m}>{m} min</option>)}
                </select>
              </label>
              <SubmitButton className={quiet}>Save setup</SubmitButton>
            </form>
          )}

          {canEdit && slots.length > 1 && (
            <p className="mb-3 text-sm text-muted">
              To trade two teams&apos; places, drag one slot onto the other, or press Swap on one and Swap here on the other. Times stay the same. Edit under a slot changes its time, length or station.
            </p>
          )}
          <div id="slots" className="grid scroll-mt-4 gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(stations, 3)}, minmax(0, 1fr))` }}>
            {Array.from({ length: stations }, (_, i) => i + 1).map((n) => {
              const mine = slots.filter((s) => s.station === n).sort((a, b) => toMinutes(a.starts_at) - toMinutes(b.starts_at));
              return (
                <section key={n} className="rounded-lg border border-line p-3">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Station {n}</h3>
                  {mine.length === 0 && <p className="text-sm text-muted">Nothing yet.</p>}
                  <ul className="space-y-1.5">
                    {mine.map((s) => (
                      <DraggableSlot
                        key={s.id}
                        slotId={s.id}
                        enabled={canEdit}
                        swap={swapSlots.bind(null, jobId, day.id)}
                        className={cx("rounded-md px-2.5 py-2 text-sm", s.kind === "break" ? "bg-surface-2 text-muted" : "bg-surface-2", picked === s.id && "outline-2 outline-accent")}
                      >
                        {/* One line per slot. The move and remove controls fold away under Edit. */}
                        <details className="group">
                          <summary className={cx("flex list-none items-center gap-2 [&::-webkit-details-marker]:hidden", canEdit ? "cursor-pointer" : "pointer-events-none")}>
                          <span className="block min-w-0 flex-1 truncate">
                            <span className="tabular-nums text-muted">{formatTime(s.starts_at)}</span>{" "}
                            <span className="font-medium">{s.kind === "break" ? s.label || "Break" : (teamName.get(s.team_id ?? "") ?? s.label ?? "Team removed")}</span>
                            <span className="text-xs text-muted"> · {s.minutes} min</span>
                          </span>
                          {canEdit &&
                            (picked === s.id ? (
                              <Link href={`/portal/${jobId}/schedule?day=${day.id}`} scroll={false} className="shrink-0 text-xs text-accent hover:underline">Cancel swap</Link>
                            ) : picked ? (
                              <form action={swapSlots.bind(null, jobId, day.id, picked, s.id)} className="shrink-0">
                                <SubmitButton className="rounded border border-accent px-1.5 py-0.5 text-xs text-accent">Swap here</SubmitButton>
                              </form>
                            ) : (
                              <Link href={`/portal/${jobId}/schedule?day=${day.id}&swap=${s.id}`} scroll={false} className="shrink-0 text-xs text-muted hover:text-accent hover:underline">Swap</Link>
                            ))}
                          {canEdit && (
                            <span className="shrink-0 text-xs text-muted hover:text-accent">
                              <span className="group-open:hidden">Edit</span>
                              <span className="hidden group-open:inline">Close</span>
                            </span>
                          )}
                          </summary>
                          {canEdit && (
                            <div className="mt-1 flex flex-wrap items-center gap-1 pb-1">
                              <form action={updateSlot.bind(null, jobId, day.id, s.id)} className="flex flex-wrap items-center gap-1">
                                <input name="starts_at" type="time" step={300} defaultValue={s.starts_at.slice(0, 5)} required aria-label="Start time" className={input} />
                                <select key={String(s.minutes)} name="minutes" defaultValue={s.minutes} aria-label="Minutes" className={input}>
                                  {MINUTES.map((m) => <option key={m} value={m}>{m} min</option>)}
                                </select>
                                <select key={String(s.station)} name="station" defaultValue={s.station} aria-label="Station" className={input}>
                                  {Array.from({ length: Math.max(stations, s.station) }, (_, k) => k + 1).map((k) => <option key={k} value={k}>Station {k}</option>)}
                                </select>
                                <SubmitButton className={quiet}>Move</SubmitButton>
                              </form>
                              <form action={removeSlot.bind(null, jobId, day.id, s.id)}>
                                <SubmitButton className="px-2 py-1.5 text-sm text-muted hover:text-risk">Remove</SubmitButton>
                              </form>
                            </div>
                          )}
                        </details>
                      </DraggableSlot>
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
                    <SubmitButton className={primary}>Place the {unplaced.length} remaining {unplaced.length === 1 ? "team" : "teams"} for me</SubmitButton>
                    <span className="text-xs text-muted">Fills the next open times in order. You can move anything afterwards.</span>
                  </form>
                  <form action={addSlot.bind(null, jobId, day.id, schedule.id, "team")} className="flex flex-wrap items-end gap-2">
                    <select name="team_id" required aria-label="Team" className={cx(input, "min-w-40")}>
                      {unplaced.map((t) => <option key={t.id} value={t.id}>{teamName.get(t.id)}</option>)}
                    </select>
                    <select key={String(soonest + 1)} name="station" defaultValue={soonest + 1} aria-label="Station" className={input}>
                      {Array.from({ length: stations }, (_, k) => k + 1).map((k) => <option key={k} value={k}>Station {k}</option>)}
                    </select>
                    <input name="starts_at" type="time" step={300} defaultValue={toClock(free[soonest])} required aria-label="Start time" className={input} />
                    <select key={String(schedule.default_block_minutes)} name="minutes" defaultValue={schedule.default_block_minutes} aria-label="Minutes" className={input}>
                      {MINUTES.map((m) => <option key={m} value={m}>{m} min</option>)}
                    </select>
                    <SubmitButton className={quiet}>Add slot</SubmitButton>
                  </form>
                </>
              )}
              <form action={addSlot.bind(null, jobId, day.id, schedule.id, "break")} className="flex flex-wrap items-end gap-2">
                <input name="label" maxLength={80} placeholder="Break" aria-label="Break label" className={cx(input, "w-40")} />
                <select key={String(soonest + 1)} name="station" defaultValue={soonest + 1} aria-label="Station" className={input}>
                  {Array.from({ length: stations }, (_, k) => k + 1).map((k) => <option key={k} value={k}>Station {k}</option>)}
                </select>
                <input name="starts_at" type="time" step={300} defaultValue={toClock(free[soonest])} required aria-label="Start time" className={input} />
                <select key={String(15)} name="minutes" defaultValue={15} aria-label="Minutes" className={input}>
                  {MINUTES.map((m) => <option key={m} value={m}>{m} min</option>)}
                </select>
                <SubmitButton className={quiet}>Add break</SubmitButton>
                <span className="text-xs text-muted">Teams after the break on that station move later to make room.</span>
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
                <SubmitButton disabled={!!problems?.length} className={cx(primary, "disabled:cursor-not-allowed disabled:opacity-50")}>
                  Submit schedule
                </SubmitButton>
              </form>
            )}
            {office && canEdit && (
              <div className="mt-3 flex gap-2">
                {schedule.status === "submitted" && (
                  <form action={setScheduleStatus.bind(null, jobId, day.id, schedule.id, "complete")}>
                    <SubmitButton className={quiet}>Office: mark complete</SubmitButton>
                  </form>
                )}
                {done && (
                  <form action={setScheduleStatus.bind(null, jobId, day.id, schedule.id, "started")}>
                    <SubmitButton className={quiet}>Office: send back</SubmitButton>
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
