"use client";

import { useActionState } from "react";
import { saveDraft, type DraftState } from "./actions";

export function DraftEditor({ id, title, text }: { id: string; title: string; text: string }) {
  const [state, action, pending] = useActionState<DraftState, FormData>(saveDraft, null);
  const field = "w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none";
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <label className="block text-sm">
        <span className="mb-1 block text-muted">Title</span>
        <input name="title" defaultValue={title} required className={field} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-muted">
          Sections. Start each with a line like <code>## Session fee [initial]</code>. Add [initial] where the coordinator
          must initial.
        </span>
        <textarea name="text" defaultValue={text} rows={24} className={`${field} font-mono`} />
      </label>
      <button
        disabled={pending}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save draft"}
      </button>
      {state && <p className={state.ok ? "text-sm text-ok" : "text-sm text-risk"}>{state.message}</p>}
    </form>
  );
}
