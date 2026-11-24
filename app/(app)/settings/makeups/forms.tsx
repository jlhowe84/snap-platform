"use client";

import { useActionState } from "react";
import { useToast } from "@/components/toast";
import { WEEKDAYS, type Schedule } from "@/lib/makeups/schedule";
import { addBlackout, saveSchedule, type ScheduleState } from "./actions";

const field = "min-h-12 w-full min-w-0 rounded-lg border border-line bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none sm:min-h-0";
const label = "block text-sm font-medium";
const hint = "mt-1 block text-xs font-normal text-muted";
const primary = "min-h-12 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60 sm:min-h-0";

/** Open or closed, the hours of each weekday, session length and the words parents see. */
export function ScheduleForm({ schedule }: { schedule: Schedule }) {
  const [state, action, pending] = useActionState<ScheduleState, FormData>(saveSchedule, null);
  useToast(state);
  return (
    <form action={action} className="space-y-6">
      <label className="flex min-h-12 items-center gap-3 text-sm font-medium">
        <input type="checkbox" name="open" defaultChecked={schedule.open} className="h-5 w-5 accent-[var(--accent)]" />
        The booking page is open
      </label>

      <div>
        <p className="text-sm font-semibold">Open hours</p>
        <p className="text-xs text-muted">Leave a day blank to keep it closed. Use the second pair of times for a day that closes for lunch.</p>
        <div className="mt-3 divide-y divide-line">
          {WEEKDAYS.map((name, day) => (
            <div key={name} className="grid grid-cols-2 items-center gap-2 py-2 sm:grid-cols-[7rem_1fr_1fr_1fr_1fr]">
              <p className="col-span-2 text-sm font-medium sm:col-span-1">{name}</p>
              {(["", "2"] as const).flatMap((n, i) =>
                (["from", "to"] as const).map((end) => (
                  <input
                    key={`${n}${end}`}
                    type="time"
                    step={300}
                    name={`d${day}_${end}${n}`}
                    defaultValue={schedule.hours[day]?.[i]?.[end] ?? ""}
                    aria-label={`${name} ${i === 0 ? "" : "second "}${end === "from" ? "opens" : "closes"}`}
                    className={field}
                  />
                )),
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className={label}>
          Session length
          <input name="slotMinutes" type="number" min={5} max={120} step={5} defaultValue={schedule.slotMinutes} className={field} />
          <span className={hint}>Minutes. 10 gives six sessions an hour.</span>
        </label>
        <label className={label}>
          Bookings per time
          <input name="perSlot" type="number" min={1} max={20} defaultValue={schedule.perSlot} className={field} />
          <span className={hint}>How many families can share one time.</span>
        </label>
        <label className={label}>
          Booking notice
          <input name="leadHours" type="number" min={0} max={336} defaultValue={schedule.leadHours} className={field} />
          <span className={hint}>Hours ahead a time must be booked.</span>
        </label>
        <label className={label}>
          How far ahead
          <input name="daysAhead" type="number" min={1} max={180} defaultValue={schedule.daysAhead} className={field} />
          <span className={hint}>Days of dates the page offers.</span>
        </label>
      </div>

      <label className={label}>
        Where to come
        <input name="place" maxLength={300} defaultValue={schedule.place} placeholder="Studio name and address" className={field} />
        <span className={hint}>Shown on the booking page and in the confirmation.</span>
      </label>
      <label className={label}>
        What to bring or know
        <textarea name="details" rows={3} maxLength={2000} defaultValue={schedule.details} placeholder="Uniform, parking, where to check in" className={field} />
      </label>

      <div className="space-y-1">
        <label className="flex min-h-12 items-center gap-3 text-sm sm:min-h-8">
          <input type="checkbox" name="emailStaff" defaultChecked={schedule.emailStaff} className="h-5 w-5 accent-[var(--accent)]" />
          Email the office when a session is booked or cancelled, and each morning there are sessions
        </label>
        <label className="flex min-h-12 items-center gap-3 text-sm sm:min-h-8">
          <input type="checkbox" name="emailParent" defaultChecked={schedule.emailParent} className="h-5 w-5 accent-[var(--accent)]" />
          Email the parent a confirmation with their cancel link
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className={primary}>{pending ? "Saving…" : "Save schedule"}</button>
        {state && <p className={"text-sm " + (state.ok ? "text-ok" : "text-risk")}>{state.message}</p>}
      </div>
    </form>
  );
}

/** Close one day or a run of days. */
export function BlackoutForm() {
  const [state, action, pending] = useActionState<ScheduleState, FormData>(addBlackout, null);
  useToast(state);
  return (
    <form action={action} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[10rem_10rem_1fr_auto]">
      <label className={label}>
        First day
        <input name="from" type="date" required className={field} />
      </label>
      <label className={label}>
        Last day
        <input name="to" type="date" className={field} />
      </label>
      <label className={label}>
        Reason
        <input name="note" maxLength={120} placeholder="Holiday, away at a job" className={field} />
      </label>
      <button disabled={pending} className={primary}>{pending ? "Saving…" : "Close these dates"}</button>
      {state && !state.ok && <p className="text-sm text-risk sm:col-span-4">{state.message}</p>}
    </form>
  );
}
