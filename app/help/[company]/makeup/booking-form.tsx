"use client";

import { useActionState } from "react";
import { formatTime } from "@/lib/dates";
import { bookMakeup, type BookState } from "./actions";

const field = "min-h-12 w-full min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-base text-text focus:border-accent focus:outline-none";
const label = "block text-sm font-medium";

/** Steps two and three of booking: the time, then who is coming. */
export function BookingForm({
  slug,
  date,
  dateLabel,
  times,
  order,
  kind,
  leadHours,
}: {
  slug: string;
  date: string;
  dateLabel: string;
  times: string[];
  order: string;
  kind: "makeup" | "retake";
  leadHours: number;
}) {
  const [state, action, pending] = useActionState<BookState, FormData>(bookMakeup.bind(null, slug), null);
  return (
    <form action={action} className="mt-8 space-y-8">
      <input type="hidden" name="date" value={date} />
      {/* Left empty by people. */}
      <div className="hidden" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">2. Pick a time on {dateLabel}</legend>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {times.map((t) => (
            <label key={t} className="relative">
              <input type="radio" name="time" value={t} required className="peer sr-only" />
              <span className="flex min-h-12 cursor-pointer items-center justify-center rounded-lg border border-line bg-surface px-2 text-sm font-medium hover:border-accent peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-ink peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                {formatTime(t)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">3. Who is coming</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(
            [
              ["makeup", "Makeup", "We missed photo day"],
              ["retake", "Retake", "We want a photo taken again"],
            ] as const
          ).map(([value, name, hint]) => (
            <label key={value} className="relative">
              <input type="radio" name="kind" value={value} defaultChecked={kind === value} className="peer sr-only" />
              <span className="flex min-h-12 cursor-pointer flex-col justify-center rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:border-accent peer-checked:border-accent peer-checked:ring-1 peer-checked:ring-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                <span className="font-semibold">{name}</span>
                <span className="text-xs text-muted">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={label}>
            Player&apos;s name
            <input name="player" required maxLength={120} autoComplete="off" className={field} />
          </label>
          <label className={label}>
            League or organization
            <input name="league" maxLength={160} className={field} />
          </label>
          <label className={label}>
            Team
            <input name="team" maxLength={160} className={field} />
          </label>
          <label className={label}>
            Order number, if you have one
            <input name="order_number" inputMode="numeric" pattern="\d*" maxLength={12} defaultValue={order} className={field} />
          </label>
          <label className={label}>
            Your name
            <input name="parent_name" required maxLength={120} autoComplete="name" className={field} />
          </label>
          <label className={label}>
            Email
            <input name="email" type="email" required maxLength={254} autoComplete="email" className={field} />
          </label>
          <label className={label}>
            Phone
            <input name="phone" type="tel" maxLength={40} autoComplete="tel" className={field} />
          </label>
        </div>
        <label className={label}>
          Anything we should know
          <textarea name="note" rows={3} maxLength={1000} className={field} />
        </label>
      </fieldset>

      {state && !state.ok && (
        <p role="alert" className="rounded-lg border border-risk/50 bg-surface px-3 py-2 text-sm font-medium text-risk">
          {state.message}
        </p>
      )}
      <div>
        <button disabled={pending} className="min-h-12 w-full rounded-lg bg-accent px-5 py-3 text-base font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60 sm:w-auto">
          {pending ? "Booking…" : "Book this time"}
        </button>
        <p className="mt-2 text-xs text-muted">
          We will email you a confirmation with a link to cancel. {leadHours > 0 ? `A time must be booked at least ${leadHours} hours before it starts.` : ""}
        </p>
      </div>
    </form>
  );
}
