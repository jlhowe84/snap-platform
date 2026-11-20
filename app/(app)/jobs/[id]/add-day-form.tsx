"use client";

import { useActionState } from "react";
import { useToast } from "@/components/toast";
import { addPhotoDay, type AddDayState } from "./add-day-actions";

const field = "mt-1 min-h-12 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none sm:min-h-0";
const label = "block text-xs text-muted";

export type DayDefaults = { location_name: string | null; address: string | null; city: string | null; state: string | null; stations: number | null };

/** Another photo day for this job, starting from the last day's place. */
export function AddDayForm({ jobId, defaults }: { jobId: string; defaults: DayDefaults | null }) {
  const [state, action, pending] = useActionState<AddDayState, FormData>(addPhotoDay.bind(null, jobId), null);
  useToast(state);
  return (
    <details className="mt-4 border-t border-line pt-3">
      <summary className="flex min-h-12 cursor-pointer items-center text-sm font-medium text-accent hover:underline sm:min-h-0">Add a photo day</summary>
      <form key={state?.ok ? "done" : "open"} action={action} className="mt-3 space-y-3 rounded-lg border border-line p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={label}>
            Date
            <input name="date" type="date" required className={field} />
          </label>
          <label className={label}>
            Label (optional)
            <input name="label" maxLength={120} placeholder="Night 2, Travel teams, Rain date" className={field} />
          </label>
          <label className={label}>
            Start
            <input name="start_time" type="time" step={300} className={field} />
          </label>
          <label className={label}>
            End
            <input name="end_time" type="time" step={300} className={field} />
          </label>
          <label className={label}>
            Location
            <input name="location_name" maxLength={200} defaultValue={defaults?.location_name ?? ""} className={field} />
          </label>
          <label className={label}>
            Address
            <input name="address" maxLength={200} defaultValue={defaults?.address ?? ""} className={field} />
          </label>
          <label className={label}>
            City
            <input name="city" maxLength={100} defaultValue={defaults?.city ?? ""} className={field} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              State
              <input name="state" maxLength={40} defaultValue={defaults?.state ?? ""} className={field} />
            </label>
            <label className={label}>
              Stations
              <input name="stations" type="number" min={1} max={20} defaultValue={defaults?.stations ?? 2} required className={field} />
            </label>
          </div>
        </div>
        <p className="text-xs text-muted">The place is filled in from this job&apos;s last photo day. Change it if this day is somewhere else.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={pending} className="min-h-12 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60 sm:min-h-0">
            {pending ? "Adding…" : "Add photo day"}
          </button>
          {state && !state.ok && <p className="text-sm text-risk">{state.message}</p>}
          {state?.ok && <p className="text-sm text-ok">{state.message}</p>}
        </div>
      </form>
    </details>
  );
}
