"use client";

import { useActionState, useState } from "react";
import { useToast } from "@/components/toast";
import { changePhotoDay, type DateChangeState } from "./date-actions";

const field = "rounded-lg border border-line bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none";

export function ChangeDateForm({ jobId, photoDayId, postponed }: { jobId: string; photoDayId: string; postponed: boolean }) {
  const [state, action, pending] = useActionState<DateChangeState, FormData>(changePhotoDay.bind(null, jobId, photoDayId), null);
  useToast(state);
  const [kind, setKind] = useState("reschedule");

  if (state?.ok) return <p className="mt-2 text-sm text-ok">{state.message}</p>;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-sm text-accent hover:underline">Change date</summary>
      <form action={action} className="mt-3 space-y-3 rounded-lg border border-line p-3">
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            What is changing
            <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
              <option value="reschedule">{postponed ? "Set the new date" : "Move to a new date"}</option>
              {!postponed && <option value="postpone">Postpone, new date to come</option>}
              <option value="cancel">Cancel this photo day</option>
            </select>
          </label>
          {kind === "reschedule" && (
            <label className="flex flex-col gap-1 text-xs text-muted">
              New date
              <input type="date" name="new_date" required className={field} />
            </label>
          )}
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Reason (kept on the record, not sent to the league)
          <input name="reason" required maxLength={500} className={field} placeholder="Rain, field closed, league asked" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="notify" defaultChecked /> Draft a notice to the coordinator for the approval queue
        </label>
        {kind === "reschedule" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="override" /> Allow it even if the new date is full
          </label>
        )}
        <p className="text-xs text-muted">
          This keeps the original date on the record, restarts the reminders from the new date, withdraws reminders
          drafted for the old one, and adds tasks to update Captura and the calendar.
        </p>
        <button
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Saving…" : kind === "cancel" ? "Cancel this photo day" : kind === "postpone" ? "Postpone" : "Change the date"}
        </button>
        {state && !state.ok && <p className="text-sm text-risk">{state.message}</p>}
      </form>
    </details>
  );
}
