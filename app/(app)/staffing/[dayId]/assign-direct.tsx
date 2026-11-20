"use client";

import { useActionState } from "react";
import { assignDirect, type StaffingState } from "../actions";
import { POSITION_LABEL, SHIFT_POSITIONS } from "@/lib/staffing/plan";

const input = "rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm";

export type DirectChoice = { id: string; full_name: string; level: number | null; positions: string[]; busy: boolean };

/** Put someone straight on a photo day, without an offer. */
export function AssignDirect({ dayId, crew }: { dayId: string; crew: DirectChoice[] }) {
  const [state, action, pending] = useActionState<StaffingState, FormData>(assignDirect.bind(null, dayId), null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <select name="crew_member_id" required defaultValue="" aria-label="Crew member" className={`${input} max-w-56`}>
        <option value="" disabled>Choose a person…</option>
        {crew.map((c) => (
          <option key={c.id} value={c.id} disabled={c.busy}>
            {c.full_name}
            {c.level != null ? ` (L${c.level})` : ""}
            {c.busy ? ", already on this date" : ""}
          </option>
        ))}
      </select>
      <select name="position" defaultValue="photographer" aria-label="Position" className={input}>
        {SHIFT_POSITIONS.map((p) => <option key={p} value={p}>{POSITION_LABEL[p]}</option>)}
      </select>
      <button disabled={pending} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-accent hover:text-accent disabled:opacity-60">
        {pending ? "Adding…" : "Assign"}
      </button>
      {state && <p role="status" className={`w-full text-sm ${state.ok ? "text-muted" : "text-risk"}`}>{state.message}</p>}
    </form>
  );
}
