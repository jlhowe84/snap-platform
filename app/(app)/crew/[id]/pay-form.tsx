"use client";

import { useActionState } from "react";
import { savePayRate, type PayState } from "../actions";
import { POSITION_LABEL } from "@/lib/staffing/plan";

const field = "mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm";
const label = "block text-xs font-semibold uppercase tracking-[0.14em] text-muted";

export function PayForm({ crewId, positions }: { crewId: string; positions: string[] }) {
  const [state, action, pending] = useActionState<PayState, FormData>(savePayRate.bind(null, crewId), null);
  return (
    <form action={action} className="grid items-end gap-3 md:grid-cols-[1.5fr_1fr_1fr_auto]">
      <label className={label}>
        Position
        <select name="position" className={field} defaultValue={positions[0] ?? "photographer"}>
          {Object.entries(POSITION_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </label>
      <label className={label}>
        Amount ($)
        <input name="amount" type="number" min={0} step="0.01" required className={field} />
      </label>
      <label className={label}>
        Per
        <select name="unit" className={field} defaultValue="shift">
          <option value="shift">Shift</option>
          <option value="hour">Hour</option>
        </select>
      </label>
      <button disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60">
        {pending ? "Saving…" : "Save rate"}
      </button>
      {state && <p role="status" className={`md:col-span-4 text-sm ${state.ok ? "text-muted" : "text-risk"}`}>{state.message}</p>}
    </form>
  );
}
