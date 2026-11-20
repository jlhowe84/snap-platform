"use client";

import { useActionState, useState, useTransition } from "react";
import { toast, useToast } from "@/components/toast";
import { addJobNote, deleteJobNote, type NotesState } from "./notes-actions";

/** One new entry for the job's notes log. */
export function AddNoteForm({ jobId }: { jobId: string }) {
  const [state, action, pending] = useActionState<NotesState, FormData>(addJobNote.bind(null, jobId), null);
  useToast(state);
  return (
    <form action={action} className="space-y-2">
      <textarea
        name="body"
        required
        maxLength={5000}
        rows={3}
        placeholder="Add a note: gate codes, who to ask for, what went wrong last time."
        className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-base text-text focus:border-accent focus:outline-none sm:text-sm"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="min-h-12 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60 sm:min-h-0">
          {pending ? "Adding…" : "Add note"}
        </button>
        {state && !state.ok && <p className="text-sm text-risk">{state.message}</p>}
      </div>
    </form>
  );
}

/** Delete with a second step, like deleting a photo day. */
export function DeleteNote({ jobId, noteId }: { jobId: string; noteId: string }) {
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="flex min-h-12 items-center text-xs text-muted hover:text-risk hover:underline sm:min-h-0">
        Delete
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs">
      Delete this note?
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await deleteJobNote(jobId, noteId);
            if (result) toast(result.ok, result.message);
            if (!result?.ok) setAsking(false);
          })
        }
        className="min-h-12 rounded-lg bg-risk px-3 py-1.5 font-semibold text-white disabled:opacity-60 sm:min-h-0"
      >
        {pending ? "Deleting…" : "Yes, delete"}
      </button>
      <button type="button" disabled={pending} onClick={() => setAsking(false)} className="min-h-12 rounded-lg border border-line px-3 py-1.5 font-semibold sm:min-h-0">
        Keep
      </button>
    </span>
  );
}
