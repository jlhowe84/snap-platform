"use client";

import { useActionState } from "react";
import { useToast } from "@/components/toast";
import { addShifts, type StaffingState } from "../actions";
import { POSITION_LABEL, SHIFT_POSITIONS, type ShiftPosition } from "@/lib/staffing/plan";

const field = "mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm";
const label = "block text-xs font-semibold uppercase tracking-[0.14em] text-muted";

export function AddShifts({
  dayId,
  counts,
  start,
  end,
  stations,
}: {
  dayId: string;
  counts: Record<ShiftPosition, number>;
  start: string | null;
  end: string | null;
  stations: number;
}) {
  const [state, action, pending] = useActionState<StaffingState, FormData>(addShifts.bind(null, dayId), null);
  useToast(state);
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {SHIFT_POSITIONS.map((p) => (
          <label key={p} className={label}>
            {POSITION_LABEL[p]}s
            <input name={p} type="number" min={0} max={40} defaultValue={counts[p]} className={field} />
          </label>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <label className={label}>
          Start
          <input name="start_time" type="time" defaultValue={start?.slice(0, 5) ?? ""} className={field} />
        </label>
        <label className={label}>
          End
          <input name="end_time" type="time" defaultValue={end?.slice(0, 5) ?? ""} className={field} />
        </label>
      </div>
      <p className="text-xs text-muted">
        Starts from {stations} station{stations === 1 ? "" : "s"}: a photographer and a poser per station and one coordinator for the day. Change the
        counts if this shoot needs something different.
      </p>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60">
          {pending ? "Adding…" : "Add shifts"}
        </button>
        {state && <p role="status" className={state.ok ? "text-sm text-muted" : "text-sm text-risk"}>{state.message}</p>}
      </div>
    </form>
  );
}
