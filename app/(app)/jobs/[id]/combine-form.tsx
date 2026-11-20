"use client";

import { useActionState } from "react";
import { combineJobs, type CombineState } from "./combine-actions";

/**
 * Brings another job of the same league into this one, for a league whose
 * photo days were entered as separate jobs. The tick box stands in for a
 * confirm step because the emptied job is removed for good.
 */
export function CombineForm({ jobId, others }: { jobId: string; others: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState<CombineState, FormData>(combineJobs, null);
  return (
    <form action={action} className="space-y-3 text-sm">
      <input type="hidden" name="keep" value={jobId} />
      <label className="block">
        <span className="mb-1 block text-muted">Job to bring into this one</span>
        <select name="other" required defaultValue="" className="min-h-12 w-full rounded-lg border border-line bg-surface px-2 py-2 text-base md:min-h-10 md:text-sm">
          <option value="" disabled>
            Pick a job…
          </option>
          {others.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-h-12 items-start gap-2 md:min-h-0">
        <input type="checkbox" name="sure" required className="mt-1 size-4" />
        <span>Move its photo days, crew, tasks, contacts and links here and remove that job. This cannot be undone.</span>
      </label>
      {state && !state.ok && (
        <p role="alert" className="text-risk">
          {state.message}
        </p>
      )}
      <button disabled={pending} className="min-h-12 w-full rounded-lg border border-line px-3 py-2 font-semibold hover:border-accent hover:text-accent disabled:opacity-60 md:min-h-10 md:w-auto">
        {pending ? "Combining…" : "Combine into this job"}
      </button>
    </form>
  );
}
