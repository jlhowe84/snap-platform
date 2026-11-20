"use client";

import { useActionState } from "react";
import { useToast } from "@/components/toast";
import { checkInvoices, matchReference, type LabState } from "./actions";

export function CheckInvoices() {
  const [state, action, pending] = useActionState<LabState>(checkInvoices, null);
  useToast(state);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      {state && (
        <p role="status" className={state.ok ? "text-sm text-muted" : "text-sm text-risk"}>
          {state.message}
        </p>
      )}
      <button
        disabled={pending}
        className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:border-accent hover:text-accent disabled:opacity-60"
      >
        {pending ? "Checking…" : "Check for new invoices"}
      </button>
    </form>
  );
}

export function MatchJob({ reference, jobId, jobs }: { reference: string; jobId: string | null; jobs: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState<LabState, FormData>(matchReference, null);
  useToast(state);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="reference" value={reference} />
      <label className="flex min-w-0 flex-col gap-1 text-sm">
        <span className="font-medium">Job these invoices belong to</span>
        <select name="job" defaultValue={jobId ?? ""} className="max-w-full rounded-lg border border-line bg-surface px-3 py-2">
          <option value="">Not matched</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.label}
            </option>
          ))}
        </select>
      </label>
      <button disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60">
        {pending ? "Saving…" : "Save match"}
      </button>
      {state && <p role="status" className={state.ok ? "text-sm text-ok" : "text-sm text-risk"}>{state.message}</p>}
    </form>
  );
}
