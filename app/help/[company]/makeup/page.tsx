import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public-shell";
import { formatDate } from "@/lib/dates";
import { isDate, openDays } from "@/lib/makeups/schedule";
import { loadPublicSchedule, takenFrom } from "@/lib/makeups/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BookingForm } from "./booking-form";

export const metadata: Metadata = { title: "Book a makeup or retake" };
export const dynamic = "force-dynamic";

// The public booking page: pick a day, pick a time, say who is coming. Only
// counts of taken times are read here, never another family's booking.
export default async function MakeupBooking({ params, searchParams }: PageProps<"/help/[company]/makeup">) {
  const loaded = await loadPublicSchedule((await params).company);
  if (!loaded) notFound();
  const { company, schedule, now } = loaded;
  const sp = await searchParams;
  const taken = schedule.open ? await takenFrom(createAdminClient(), company.id, now.date, schedule.daysAhead + 1) : {};
  const days = openDays(schedule, now, taken);
  const wanted = typeof sp.d === "string" && isDate(sp.d) ? sp.d : null;
  const day = days.find((d) => d.date === wanted) ?? days[0] ?? null;
  const order = typeof sp.order === "string" && /^\d{1,12}$/.test(sp.order) ? sp.order : "";
  const kind = sp.kind === "retake" ? "retake" : "makeup";
  const keep = `${order ? `&order=${order}` : ""}${kind === "retake" ? "&kind=retake" : ""}`;

  return (
    <PublicShell companyName={company.name} companySlug={company.slug} kicker="Makeups and retakes">
      <h1 className="font-display text-4xl font-semibold uppercase tracking-wide">Book a makeup or retake</h1>
      <p className="mt-2 text-muted">
        Missed photo day, or want a photo taken again? Pick a day and a time below. Each session is {schedule.slotMinutes} minutes.
      </p>
      {(schedule.place || schedule.details) && (
        <section className="mt-6 rounded-xl border border-line bg-surface p-5 text-sm">
          {schedule.place && (
            <p>
              <span className="font-semibold">Where: </span>
              {schedule.place}
            </p>
          )}
          {schedule.details && <p className="mt-2 whitespace-pre-line text-muted">{schedule.details}</p>}
        </section>
      )}

      {!day ? (
        <section className="mt-6 rounded-xl border border-line bg-surface p-5">
          <p className="font-semibold">{schedule.open ? "Every time is taken right now." : "Online booking is closed right now."}</p>
          <p className="mt-1 text-sm text-muted">Reply to any email from us and a person will find you a time.</p>
        </section>
      ) : (
        <>
          <section className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">1. Pick a day</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {days.slice(0, 30).map((d) => (
                <Link
                  key={d.date}
                  href={`?d=${d.date}${keep}`}
                  scroll={false}
                  aria-current={d.date === day.date ? "true" : undefined}
                  className={
                    "flex min-h-12 min-w-0 flex-col justify-center rounded-lg border px-3 py-2 text-sm " +
                    (d.date === day.date ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface hover:border-accent")
                  }
                >
                  <span className="font-semibold">{formatDate(d.date, { weekday: true }).replace(/, \d{4}$/, "")}</span>
                  <span className={d.date === day.date ? "text-xs opacity-90" : "text-xs text-muted"}>
                    {d.slots.length} time{d.slots.length === 1 ? "" : "s"} open
                  </span>
                </Link>
              ))}
            </div>
          </section>
          <BookingForm key={day.date} slug={company.slug} date={day.date} dateLabel={formatDate(day.date, { weekday: true })} times={day.slots.map((s) => s.time)} order={order} kind={kind} leadHours={schedule.leadHours} />
        </>
      )}
    </PublicShell>
  );
}
