"use client";

import { useActionState } from "react";
import { useToast } from "@/components/toast";
import { CASE_STATUSES, CASE_STATUS_LABEL, type CaseStatus } from "@/lib/production/no-photos";
import { checkNoPhotos, saveNoPhotoCase, type NoPhotoState } from "./actions";

const field = "min-h-12 min-w-0 rounded-lg border border-line bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none sm:min-h-0";

/** Starts the check for one job and says what it found. */
export function CheckNoPhotos({ jobId, checkedBefore }: { jobId: string; checkedBefore: boolean }) {
  const [state, action, pending] = useActionState<NoPhotoState>(() => checkNoPhotos(jobId), null);
  useToast(state);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button disabled={pending} className="min-h-12 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60 sm:min-h-0">
        {pending ? "Checking Captura…" : checkedBefore ? "Check again" : "Check for orders with no photos"}
      </button>
      {state && <p className={"text-sm " + (state.ok ? "text-ok" : "text-risk")}>{state.message}</p>}
    </form>
  );
}

/** One order's status and note, saved together. */
export function CaseForm({ caseId, status, note }: { caseId: string; status: CaseStatus; note: string | null }) {
  const [state, action, pending] = useActionState<NoPhotoState, FormData>(saveNoPhotoCase.bind(null, caseId), null);
  useToast(state);
  return (
    <form action={action} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[11rem_1fr_auto]">
      <select name="status" defaultValue={status} aria-label="Status" className={field}>
        {CASE_STATUSES.map((s) => <option key={s} value={s}>{CASE_STATUS_LABEL[s]}</option>)}
      </select>
      <input name="note" maxLength={1000} defaultValue={note ?? ""} placeholder="Note: who was told, makeup date, refund asked" aria-label="Note" className={field} />
      <button disabled={pending} className="min-h-12 rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:border-accent hover:text-accent disabled:opacity-60 sm:min-h-0">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
