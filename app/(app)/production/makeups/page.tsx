import type { Metadata } from "next";
import Link from "next/link";
import { ADMIN_ROLES, hasAnyRole, OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill, Stat, cx, type Tone } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/dates";
import {
  BOOKING_STATUS_LABEL,
  FOLLOW_UP,
  isDate,
  KIND_LABEL,
  MAKEUP_SETTING,
  readSchedule,
  wallClock,
  type BookingStatus,
  type Kind,
} from "@/lib/makeups/schedule";
import { AddBooking, BookingForm, MoveOrCancel } from "./forms";

export const metadata: Metadata = { title: "Makeups and retakes" };

const VIEWS = { upcoming: "Upcoming", follow: "Needs follow-up", past: "Past", cancelled: "Cancelled" } as const;
type View = keyof typeof VIEWS;
const TONE: Record<BookingStatus, Tone> = { booked: "info", done: "ok", no_show: "warn", cancelled: "muted" };
const SUPPORT_AND_OFFICE = [...OFFICE_ROLES, "support"] as const;

/**
 * Every makeup and retake session: who is coming and when, the photo slip to
 * print for each, and the follow-up after the photo is taken. Support can
 * read the list; the office works it.
 */
export default async function MakeupsPage({ searchParams }: PageProps<"/production/makeups">) {
  const viewer = await requireStaff(SUPPORT_AND_OFFICE);
  const canEdit = hasAnyRole(viewer, OFFICE_ROLES);
  const sp = await searchParams;
  const date = typeof sp.date === "string" && isDate(sp.date) ? sp.date : null;
  const view: View = typeof sp.view === "string" && sp.view in VIEWS ? (sp.view as View) : "upcoming";
  const today = wallClock(viewer.timeZone).date;
  const supabase = await createClient();

  let q = supabase
    .from("makeup_bookings")
    .select(
      "id, date, start_time, minutes, kind, status, source, player, league, team, parent_name, email, phone, order_number, parent_note, online_code, staff_note, imported, uploaded, added_to_team, email_sent, lab_sent, job_id, jobs(name)",
    )
    .limit(300);
  if (date) q = q.eq("date", date).order("start_time");
  else if (view === "upcoming") q = q.eq("status", "booked").gte("date", today).order("date").order("start_time");
  else if (view === "follow") q = q.eq("status", "done").or(FOLLOW_UP.map((f) => `${f.key}.eq.false`).join(",")).order("date").order("start_time");
  else if (view === "cancelled") q = q.eq("status", "cancelled").order("date", { ascending: false }).order("start_time");
  else q = q.neq("status", "cancelled").lt("date", today).order("date", { ascending: false }).order("start_time");

  const open = () => supabase.from("makeup_bookings").select("id", { count: "exact", head: true });
  const [{ data: rows }, { count: todayCount }, { count: upcoming }, { count: follow }, { data: setting }] = await Promise.all([
    q,
    open().eq("status", "booked").eq("date", today),
    open().eq("status", "booked").gte("date", today),
    open().eq("status", "done").or(FOLLOW_UP.map((f) => `${f.key}.eq.false`).join(",")),
    supabase.from("settings").select("value").eq("key", MAKEUP_SETTING).maybeSingle(),
  ]);
  const schedule = readSchedule(setting?.value);
  const bookings = rows ?? [];
  const byDate = new Map<string, typeof bookings>();
  for (const b of bookings) byDate.set(b.date, [...(byDate.get(b.date) ?? []), b]);
  const quiet = "inline-flex min-h-12 items-center rounded-lg border border-line px-3 text-sm hover:border-accent hover:text-accent sm:min-h-0 sm:py-1.5";

  return (
    <>
      <PageHeader eyebrow="Jobs · Production" title="Makeups and retakes" back={{ href: "/production", label: "Production" }}>
        {viewer.companySlug && (
          <Link href={`/help/${viewer.companySlug}/makeup`} target="_blank" className={quiet}>
            Booking page
          </Link>
        )}
        {hasAnyRole(viewer, ADMIN_ROLES) && (
          <Link href="/settings/makeups" className={quiet}>
            Hours and blackout dates
          </Link>
        )}
      </PageHeader>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href={`/production/makeups?date=${today}`} className="rounded-xl hover:ring-1 hover:ring-accent">
          <Stat label="Today" value={todayCount ?? 0} hint="Sessions booked for today" />
        </Link>
        <Link href="/production/makeups" className="rounded-xl hover:ring-1 hover:ring-accent">
          <Stat label="Upcoming" value={upcoming ?? 0} hint={schedule.open ? "The booking page is open" : "The booking page is closed"} />
        </Link>
        <Link href="/production/makeups?view=follow" className="rounded-xl hover:ring-1 hover:ring-accent">
          <Stat label="Needs follow-up" value={follow ?? 0} hint="Photographed, with a box still unticked" />
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link
            key={v}
            href={v === "upcoming" ? "/production/makeups" : `/production/makeups?view=${v}`}
            aria-current={!date && v === view ? "page" : undefined}
            className={cx(quiet, !date && v === view && "border-accent text-accent")}
          >
            {VIEWS[v]}
          </Link>
        ))}
        {date && <span className={cx(quiet, "border-accent text-accent")}>{formatDate(date, { weekday: true })}</span>}
      </div>

      <div className="space-y-6">
        {bookings.length === 0 && (
          <Card>
            <Empty>{date ? "No sessions on this date." : view === "upcoming" ? "No sessions are booked." : "Nothing here."}</Empty>
          </Card>
        )}
        {[...byDate.entries()].map(([day, list]) => (
          <Card key={day} title={`${formatDate(day, { weekday: true })}${day === today ? " · Today" : ""}`}>
            <ul className="divide-y divide-line">
              {list.map((b) => {
                const status = b.status as BookingStatus;
                const job = b.jobs as { name: string } | null;
                return (
                  <li key={b.id} className="py-4 text-sm first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="min-w-0 text-base font-semibold [overflow-wrap:anywhere]">
                        <span className="font-mono">{formatTime(b.start_time)}</span> · {b.player}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone="muted">{KIND_LABEL[b.kind as Kind]}</Pill>
                        <Pill tone={TONE[status]}>{BOOKING_STATUS_LABEL[status]}</Pill>
                      </div>
                    </div>
                    <p className="mt-1 text-muted [overflow-wrap:anywhere]">
                      {[b.league, b.team, b.order_number ? `Order ${b.order_number}` : null, b.source === "staff" ? "Booked by the office" : null].filter(Boolean).join(" · ") || "No league or team given"}
                    </p>
                    <p className="mt-1 [overflow-wrap:anywhere]">
                      {b.parent_name ?? "No parent name"}
                      {b.email && (
                        <>
                          {" · "}
                          <a href={`mailto:${b.email}`} className="text-accent hover:underline">{b.email}</a>
                        </>
                      )}
                      {b.phone && (
                        <>
                          {" · "}
                          <a href={`tel:${b.phone.replace(/[^\d+]/g, "")}`} className="text-accent hover:underline">{b.phone}</a>
                        </>
                      )}
                    </p>
                    {b.parent_note && <p className="mt-1 rounded-lg bg-surface-2 px-3 py-2 text-muted">“{b.parent_note}”</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Link href={`/slip/${b.id}`} target="_blank" className={cx(quiet, "font-semibold")}>
                        Print photo slip
                      </Link>
                      {job && b.job_id && (
                        <Link href={`/jobs/${b.job_id}`} className={quiet}>
                          {job.name}
                        </Link>
                      )}
                      {!b.online_code && status === "booked" && <span className="text-xs text-warn">No online code yet</span>}
                    </div>
                    {canEdit && status === "booked" && (
                      <details className="mt-2">
                        <summary className="flex min-h-12 cursor-pointer items-center text-sm text-accent hover:underline sm:min-h-8">Change the time or cancel</summary>
                        <MoveOrCancel id={b.id} date={b.date} time={b.start_time.slice(0, 5)} hasEmail={!!b.email} />
                      </details>
                    )}
                    {canEdit && (
                      <details className="mt-2">
                        <summary className="flex min-h-12 cursor-pointer items-center text-sm text-accent hover:underline sm:min-h-8">
                          Status, slip details and follow-up
                          <span className="ml-2 text-xs text-muted">
                            {FOLLOW_UP.filter((f) => b[f.key]).length} of {FOLLOW_UP.length} done
                          </span>
                        </summary>
                        <BookingForm
                          canFind
                          booking={{
                            id: b.id,
                            status,
                            league: b.league,
                            team: b.team,
                            order_number: b.order_number,
                            online_code: b.online_code,
                            staff_note: b.staff_note,
                            imported: b.imported,
                            uploaded: b.uploaded,
                            added_to_team: b.added_to_team,
                            email_sent: b.email_sent,
                            lab_sent: b.lab_sent,
                          }}
                        />
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}

        {canEdit && (
          <Card title="Book a session for someone">
            <p className="mb-4 text-sm text-muted">
              For a parent who called or wrote in. The office can use any time, inside the open hours or not; a time still holds only {schedule.perSlot}{" "}
              {schedule.perSlot === 1 ? "booking" : "bookings"}.
            </p>
            <AddBooking date={date ?? today} />
          </Card>
        )}
      </div>
    </>
  );
}
