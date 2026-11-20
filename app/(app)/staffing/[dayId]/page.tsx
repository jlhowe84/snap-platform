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
import { AssignDirect } from "./assign-direct";
import { ConfirmButton } from "@/components/confirm-button";
import { addKitToDay, checkKitIn, removeKitFromDay, sendKitOut } from "../../gear/actions";
import { CHECKOUT_LABEL, KIT_STATUS_LABEL } from "@/lib/gear/field";

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

  const [{ data: shifts }, { data: crew }, { data: busy }, { data: kits }, { data: dayKits }, { data: kitsThatDate }, { data: checklist }] = await Promise.all([
    supabase
      .from("shifts")
      .select("id, position, station, start_time, end_time, status, open_level, filled_by, crew_member_id, crew_members!shifts_crew_member_id_fkey(full_name, level), shift_responses(response)")
      .eq("photo_day_id", dayId)
      .order("position")
      .order("station", { nullsFirst: false })
      .order("created_at"),
    supabase.from("crew_members").select("id, full_name, positions, level, active").eq("active", true).order("full_name"),
    supabase.from("shifts").select("crew_member_id, photo_days!inner(date)").eq("photo_days.date", day.date).eq("status", "filled"),
    supabase.from("kits").select("id, code, status").neq("status", "retired").order("code"),
    supabase.from("kit_checkouts").select("id, kit_id, station, status, missing, issues, kits(code)").eq("photo_day_id", dayId).order("station"),
    supabase.from("kit_checkouts").select("kit_id, photo_days!inner(date)").eq("photo_days.date", day.date).neq("status", "back"),
    supabase.from("kit_checklist_items").select("name, outdoor_only").eq("active", true).order("position"),
  ]);
  const takenKits = new Set((kitsThatDate ?? []).map((k) => k.kit_id));
  const freeKits = (kits ?? []).filter((k) => !takenKits.has(k.id));
  const checkItems = (checklist ?? []).filter((i) => !i.outdoor_only || day.indoor !== true);

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
        <Link href={`/field/${day.id}`} className={quiet}>Field view</Link>
        <Link href={`/jobs/${day.jobs.id}`} className={quiet}>Open the job</Link>
      </PageHeader>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="The day">
          <p>{[formatTime(day.start_time), formatTime(day.end_time)].filter(Boolean).join(" to ") || "No times yet"}</p>
          <p className="text-sm text-muted">{[day.label, day.location_name, day.city, day.state].filter(Boolean).join(", ")}</p>
          <p className="mt-2 text-sm text-muted">
            {day.stations} station{day.stations === 1 ? "" : "s"} · {day.indoor == null ? "Indoor or outdoor not known" : day.indoor ? "Indoors" : "Outdoors"}
          </p>
        </Card>
        <Card title="Filled">
          <p className="font-display text-4xl font-semibold">{sum.filled} of {sum.total}</p>
          <p className="text-sm text-muted">shifts filled{sum.drafts ? `, ${sum.drafts} not published yet` : ""}</p>
        </Card>
      </div>

      {/* The page runs in working order: add shifts, publish them, fill them, then kits. */}
      {sum.drafts > 0 && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/60 bg-accent/10 p-4">
          <div>
            <p className="font-semibold">
              {sum.drafts} shift{sum.drafts === 1 ? " is" : "s are"} not published yet
            </p>
            <p className="text-sm text-muted">Crew cannot see a shift until it is published. Level 1 crew see it first.</p>
          </div>
          <form action={publishShifts.bind(null, day.id)}>
            <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110">
              Publish {sum.drafts} to Level 1
            </button>
          </form>
        </div>
      )}
      {canWiden && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
          <p className="text-sm text-muted">
            Open shifts that nobody has taken can be offered to the next Level, until they are open to everyone.
          </p>
          <form action={openNextWave.bind(null, day.id)}>
            <button className={quiet}>Open to the next Level</button>
          </form>
        </div>
      )}

      <Card title={list.length ? "Add more shifts" : "Step 1: add shifts"} className="mb-6">
        <AddShifts
          dayId={day.id}
          counts={sum.total ? { photographer: 0, poser: 0, coordinator: 0, photo_attendant: 0 } : defaultCounts(day.stations)}
          start={day.start_time}
          end={day.end_time}
          stations={day.stations}
        />
      </Card>

      <Card title="Who is on" className="mb-6">
        {!list.length ? (
          <Empty>No shifts yet. Add them above, then publish them so crew can take them.</Empty>
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
                        <ConfirmButton ask={`Take ${s.crew_members?.full_name ?? "this person"} off this shift and reopen it?`} className={quiet}>Take off and reopen</ConfirmButton>
                      </form>
                    )}
                    {status !== "cancelled" && (
                      <form action={cancelShift.bind(null, day.id, s.id)}>
                        {status === "draft" ? (
                          <button className={quiet}>Remove</button>
                        ) : (
                          <ConfirmButton ask={status === "filled" ? `Cancel this shift? ${s.crew_members?.full_name ?? "The person on it"} will be taken off.` : "Cancel this shift?"} className={quiet}>Cancel</ConfirmButton>
                        )}
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Assign someone directly" className="mb-6">
        <AssignDirect
          dayId={day.id}
          crew={choices.map((c) => ({ id: c.id, full_name: c.full_name, level: c.level, positions: c.positions, busy: busyIds.has(c.id) }))}
        />
        <p className="mt-2 text-xs text-muted">Puts them on this day straight away, without an offer. Their notice waits in the approval queue.</p>
      </Card>

      <Card title="Kits" className="mb-6">
        {dayKits?.length ? (
          <ul className="mb-4 divide-y divide-line">
            {dayKits.map((k) => (
              <li key={k.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Kit {k.kits?.code}</span>
                  {k.station != null && <span className="text-sm text-muted">station {k.station}</span>}
                  <Pill tone={k.status === "out" ? "warn" : k.status === "back" ? "ok" : "info"}>{CHECKOUT_LABEL[k.status] ?? k.status}</Pill>
                  {k.status === "back" && (k.missing.length > 0 || k.issues) && (
                    <span className="text-sm text-risk">{[k.missing.length ? `Missing ${k.missing.join(", ")}` : null, k.issues].filter(Boolean).join("; ")}</span>
                  )}
                  <span className="ml-auto flex gap-2">
                    {k.status === "planned" && (
                      <>
                        <form action={sendKitOut.bind(null, day.id, k.id)}><button className={quiet}>Send out</button></form>
                        <form action={removeKitFromDay.bind(null, day.id, k.id)}><button className={quiet}>Remove</button></form>
                      </>
                    )}
                  </span>
                </div>
                {k.status === "out" && (
                  <form action={checkKitIn.bind(null, day.id, k.id)} className="mt-2 rounded-lg border border-line p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Check in: tick anything that did not come back</p>
                    <div className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                      {checkItems.map((i) => (
                        <label key={i.name} className="flex items-center gap-2">
                          <input type="checkbox" name="missing" value={i.name} /> {i.name}
                        </label>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input name="issues" maxLength={2000} placeholder="Anything broken or worth knowing" className="min-w-64 flex-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-sm" />
                      <button className={primary}>Checked in</button>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-muted">No kits on this day yet. One kit per station.</p>
        )}
        <form action={addKitToDay.bind(null, day.id)} className="flex flex-wrap items-center gap-2">
          <select name="kit_id" required defaultValue="" aria-label="Kit" className="rounded-lg border border-line bg-surface px-2 py-1 text-sm">
            <option value="" disabled>Choose a kit…</option>
            {freeKits.map((k) => (
              <option key={k.id} value={k.id}>Kit {k.code}{k.status !== "ready" ? ` (${KIT_STATUS_LABEL[k.status]?.toLowerCase()})` : ""}</option>
            ))}
          </select>
          <select name="station" defaultValue="" aria-label="Station" className="rounded-lg border border-line bg-surface px-2 py-1 text-sm">
            <option value="">No station</option>
            {Array.from({ length: day.stations }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Station {n}</option>)}
          </select>
          <button className={quiet}>Add kit</button>
        </form>
      </Card>

    </>
  );
}
