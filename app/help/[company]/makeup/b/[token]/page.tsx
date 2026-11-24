import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public-shell";
import { whenLine } from "@/lib/makeups/messages";
import { canCancel, KIND_LABEL, MAKEUP_SETTING, readSchedule, wallClock, type Kind } from "@/lib/makeups/schedule";
import { bookingByToken } from "@/lib/makeups/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CancelBooking } from "./cancel";

export const metadata: Metadata = { title: "Your session", robots: { index: false } };
export const dynamic = "force-dynamic";

// A parent's own booking, opened from the link in their confirmation.
export default async function MyBooking({ params, searchParams }: PageProps<"/help/[company]/makeup/b/[token]">) {
  const { company: slug, token } = await params;
  const found = await bookingByToken(token);
  if (!found || found.company.slug !== slug) notFound();
  const { booking, company } = found;
  const isNew = (await searchParams).new === "1";
  const { data: setting } = await createAdminClient().from("settings").select("value").eq("company_id", company.id).eq("key", MAKEUP_SETTING).maybeSingle();
  const schedule = readSchedule(setting?.value);
  const slot = { date: booking.date, time: booking.start_time.slice(0, 5) };
  const open = booking.status === "booked";
  const cancellable = open && canCancel(slot, wallClock(company.timeZone));

  return (
    <PublicShell companyName={company.name} companySlug={company.slug} kicker="Makeups and retakes">
      <h1 className="font-display text-4xl font-semibold uppercase tracking-wide">
        {booking.status === "cancelled" ? "Session cancelled" : isNew ? "You are booked" : "Your session"}
      </h1>
      <section className="mt-6 rounded-xl border border-line bg-surface p-5">
        <p className={"text-lg font-semibold " + (booking.status === "cancelled" ? "line-through decoration-risk/60" : "")}>{whenLine(slot)}</p>
        <p className="mt-1 text-sm text-muted">
          {KIND_LABEL[booking.kind as Kind]} session for {booking.player}, {booking.minutes} minutes
        </p>
        {open && schedule.place && (
          <p className="mt-3 text-sm">
            <span className="font-semibold">Where: </span>
            {schedule.place}
          </p>
        )}
        {open && schedule.details && <p className="mt-2 whitespace-pre-line text-sm text-muted">{schedule.details}</p>}
        {open && isNew && <p className="mt-3 text-sm text-muted">A confirmation is on its way to {booking.email}. Keep it: it holds the link back to this page.</p>}
      </section>

      {cancellable && <CancelBooking token={token} />}
      {booking.status === "cancelled" && (
        <p className="mt-6 text-sm">
          <Link href={`/help/${company.slug}/makeup`} className="text-accent underline-offset-2 hover:underline">
            Book another time
          </Link>
        </p>
      )}
    </PublicShell>
  );
}
