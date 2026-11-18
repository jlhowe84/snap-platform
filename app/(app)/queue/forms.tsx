"use client";

import { useActionState } from "react";
import { decideDraft, runClockNow, type QueueState } from "./actions";

const field = "w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none";

export function DraftForm({
  id,
  to,
  subject,
  body,
  canDecide,
}: {
  id: string;
  to: string[];
  subject: string;
  body: string;
  canDecide: boolean;
}) {
  const [state, action, pending] = useActionState<QueueState, FormData>(decideDraft, null);
  if (state?.ok) return <p className="text-sm text-ok">{state.message}</p>;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <label className="block text-xs text-muted">
        To
        <input name="to" defaultValue={to.join(", ")} className={field} placeholder="No email on file" />
      </label>
      <label className="block text-xs text-muted">
        Subject
        <input name="subject" defaultValue={subject} required className={field} />
      </label>
      <label className="block text-xs text-muted">
        Message
        <textarea name="body" defaultValue={body} required rows={Math.min(16, body.split("\n").length + 2)} className={field} />
      </label>
      {canDecide ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            name="intent"
            value="approve"
            disabled={pending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60"
          >
            Approve
          </button>
          <button
            name="intent"
            value="reject"
            disabled={pending}
            className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-surface-2 disabled:opacity-60"
          >
            Reject
          </button>
          <input name="note" placeholder="Note (optional)" className={`${field} max-w-xs`} />
        </div>
      ) : (
        <p className="text-xs text-muted">An owner or admin decides this one.</p>
      )}
      {state && !state.ok && <p className="text-xs text-risk">{state.message}</p>}
    </form>
  );
}

export function RunClockButton() {
  const [state, action, pending] = useActionState<QueueState, FormData>(runClockNow, null);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <button disabled={pending} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-60">
        {pending ? "Checking…" : "Check what is due today"}
      </button>
      {state && <p className={state.ok ? "text-xs text-ok" : "text-xs text-risk"}>{state.message}</p>}
    </form>
  );
}
