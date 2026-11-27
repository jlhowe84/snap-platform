"use client";

import { useActionState } from "react";
import { connectHelper, type HelperKeyState } from "./helper-actions";

/** Connect a computer and show its key once, with the line that saves it to the Keychain. */
export function ConnectHelper({ siteUrl }: { siteUrl: string }) {
  const [state, action, pending] = useActionState<HelperKeyState, FormData>(connectHelper, null);
  if (state?.ok) {
    return (
      <div className="space-y-2 text-sm">
        <p className="font-semibold">{state.name} is connected. Copy this now; it is not shown again.</p>
        <p className="text-muted">On that computer, in Terminal:</p>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-surface-2 p-3 text-xs">
          {`python3 snap-helper.py setup ${siteUrl}\n`}
        </pre>
        <p className="text-muted">When it asks for the key, paste:</p>
        <pre className="overflow-x-auto break-all rounded-lg border border-line bg-surface-2 p-3 text-xs">{state.key}</pre>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="text-sm">
        <span className="mb-1 block text-muted">Computer name</span>
        <input
          name="name"
          required
          maxLength={100}
          defaultValue="Production iMac"
          className="min-h-12 rounded-lg border border-line bg-bg px-3 py-2 text-base text-text focus:border-accent focus:outline-none sm:min-h-0 sm:text-sm"
        />
      </label>
      <button disabled={pending} className="min-h-12 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60 sm:min-h-0">
        {pending ? "Connecting…" : "Connect a computer"}
      </button>
      {state && !state.ok && <p className="w-full text-sm text-risk">{state.message}</p>}
    </form>
  );
}
