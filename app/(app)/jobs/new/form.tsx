"use client";

import { useActionState } from "react";
import { useToast } from "@/components/toast";
import { createJob, type NewJobState } from "./actions";

const field = "mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none";
const label = "block text-sm font-medium";

export function NewJobForm({ leagues, orgId }: { leagues: { id: string; name: string }[]; orgId: string | null }) {
  const [state, action, pending] = useActionState<NewJobState, FormData>(createJob, null);
  useToast(state);
  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={label}>
          League
          <select name="org_id" required defaultValue={orgId ?? ""} className={field}>
            <option value="" disabled>Choose a league</option>
            {leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label className={label}>
          Job name <span className="font-normal text-muted">(optional)</span>
          <input name="name" maxLength={200} placeholder="League name and season, if left blank" className={field} />
        </label>
        <label className={label}>
          Photo day
          <input name="date" type="date" required className={field} />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className={label}>
            Start
            <input name="start_time" type="time" step={300} className={field} />
          </label>
          <label className={label}>
            End
            <input name="end_time" type="time" step={300} className={field} />
          </label>
        </div>
        <label className={label}>
          Location <span className="font-normal text-muted">(optional)</span>
          <input name="location_name" maxLength={200} className={field} />
        </label>
        <div className="grid grid-cols-[1fr_5rem] gap-4">
          <label className={label}>
            City
            <input name="city" maxLength={100} className={field} />
          </label>
          <label className={label}>
            State
            <input name="state" maxLength={40} className={field} />
          </label>
        </div>
        <label className={label}>
          Stations
          <input name="stations" type="number" min={1} max={20} defaultValue={2} required className={field} />
        </label>
        <label className={label}>
          Expected players <span className="font-normal text-muted">(optional)</span>
          <input name="expected_subjects" type="number" min={0} max={20000} className={field} />
        </label>
      </div>
      <p className="text-xs text-muted">
        This adds a booked photo day in planning, with no hold. If this league already has a job this season, open that job and use Add a photo day instead. To hold a date
        for a league that has not confirmed, use the Season board.
      </p>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60">
          {pending ? "Adding…" : "Add job"}
        </button>
        {state && !state.ok && <p className="text-sm text-risk">{state.message}</p>}
      </div>
    </form>
  );
}
