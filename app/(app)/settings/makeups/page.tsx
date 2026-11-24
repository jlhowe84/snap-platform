import type { Metadata } from "next";
import Link from "next/link";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatDate, formatRange } from "@/lib/dates";
import { MAKEUP_SETTING, openDays, readSchedule, wallClock } from "@/lib/makeups/schedule";
import { removeBlackout } from "./actions";
import { BlackoutForm, ScheduleForm } from "./forms";

export const metadata: Metadata = { title: "Makeups and retakes" };

export default async function MakeupSettings() {
  const viewer = await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("value").eq("key", MAKEUP_SETTING).maybeSingle();
  const schedule = readSchedule(data?.value);
  const now = wallClock(viewer.timeZone);
  const next = openDays(schedule, now)[0];
  const address = viewer.companySlug ? `/help/${viewer.companySlug}/makeup` : null;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/settings" className="text-muted hover:text-text">
          ← Settings
        </Link>
      </p>
      <PageHeader eyebrow="Admin" title="Makeups and retakes">
        <Pill tone={schedule.open ? "ok" : "muted"}>{schedule.open ? "Booking open" : "Booking closed"}</Pill>
      </PageHeader>

      <div className="space-y-6">
        <Card
          title="Booking page"
          action={address ? <Link href={address} target="_blank" className="text-sm text-accent hover:underline">Open the page</Link> : undefined}
        >
          <p className="text-sm text-muted">
            Anyone with the link can book. {address && <span className="font-mono text-text [overflow-wrap:anywhere]">{address}</span>}
          </p>
          <p className="mt-1 text-sm text-muted">
            {schedule.open
              ? next
                ? `The next day with open times is ${formatDate(next.date, { weekday: true })}.`
                : "No day has open times. Check the hours and the blackout dates below."
              : "Parents see a note that online booking is closed."}{" "}
            <Link href="/production/makeups" className="text-accent hover:underline">See the bookings</Link>
          </p>
        </Card>

        <Card title="Schedule">
          <ScheduleForm schedule={schedule} />
        </Card>

        <Card title="Blackout dates">
          <p className="mb-4 text-sm text-muted">Dates with no bookings, whatever the weekly hours say.</p>
          <BlackoutForm />
          <div className="mt-4">
            {schedule.blackouts.length === 0 ? (
              <Empty>No dates are closed.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {schedule.blackouts.map((b) => (
                  <li key={`${b.from}${b.to}`} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                    <p className={b.to < now.date ? "text-muted" : ""}>
                      <span className="font-medium">{formatRange(b.from, b.to)}</span>
                      {b.note ? <span className="text-muted"> · {b.note}</span> : null}
                    </p>
                    <form action={removeBlackout.bind(null, b.from, b.to)}>
                      <SubmitButton className="min-h-12 rounded-lg border border-line px-3 py-1.5 text-sm hover:border-accent hover:text-accent sm:min-h-0">Reopen</SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
