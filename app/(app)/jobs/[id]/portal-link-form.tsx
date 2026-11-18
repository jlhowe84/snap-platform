"use client";

import { useActionState, useState } from "react";
import { createPortalLink, type PortalLinkState } from "./portal-actions";

export function PortalLinkForm({ jobId, contacts }: { jobId: string; contacts: { id: string; name: string; email: string }[] }) {
  const [state, action, pending] = useActionState<PortalLinkState, FormData>(createPortalLink.bind(null, jobId), null);
  const [copied, setCopied] = useState(false);

  if (!contacts.length) {
    return <p className="text-sm text-muted">Add a contact with an email to this job to make a portal link.</p>;
  }
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select
          name="contact_id"
          required
          className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
        >
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.email})
            </option>
          ))}
        </select>
        <button
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Making…" : "Make portal link"}
        </button>
      </div>
      {state?.ok === false && <p className="text-sm text-risk">{state.message}</p>}
      {state?.ok && (
        <div className="space-y-2 rounded-lg border border-accent/50 p-3 text-sm">
          <p>
            Link for {state.contact}. Copy it now: it is shown only once. Nothing was emailed.
          </p>
          <div className="flex gap-2">
            <input readOnly value={state.url} className="min-w-0 flex-1 rounded border border-line bg-bg px-2 py-1 font-mono text-xs" />
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(state.url).then(() => setCopied(true))}
              className="rounded border border-line px-3 py-1 text-xs hover:bg-surface-2"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-muted">
            Opening it signs the browser in as that contact. Test it in a private window so you stay signed in here.
          </p>
        </div>
      )}
    </form>
  );
}
