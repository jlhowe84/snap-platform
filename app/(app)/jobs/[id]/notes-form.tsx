"use client";

import { useActionState } from "react";
import { useToast } from "@/components/toast";
import { saveJobNotes, type NotesState } from "./notes-actions";

/** Free-text notes for the office, saved on the job. */
export function NotesForm({ jobId, notes }: { jobId: string; notes: string | null }) {
  const [state, action, pending] = useActionState<NotesState, FormData>(saveJobNotes.bind(null, jobId), null);
  useToast(state);
  return (
    <form action={action} className="space-y-3">
      <textarea
        name="notes"
        defaultValue={notes ?? ""}
        maxLength={10000}
        rows={Math.min(14, Math.max(5, (notes ?? "").split("\n").length + 1))}
        placeholder="Anything worth remembering about this job: gate codes, who to ask for, what went wrong last time."
        className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-base text-text focus:border-accent focus:outline-none sm:text-sm"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="min-h-12 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60 sm:min-h-0">
          {pending ? "Saving…" : "Save notes"}
        </button>
        {state && !state.ok && <p className="text-sm text-risk">{state.message}</p>}
        <p className="text-xs text-muted">Office only. Leagues and parents never see these.</p>
      </div>
    </form>
  );
}
