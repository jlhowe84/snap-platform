"use client";

import { useActionState } from "react";
import { testCapturaConnection, type CapturaTestState } from "./actions";

export function CapturaTest() {
  const [state, action, pending] = useActionState<CapturaTestState>(testCapturaConnection, null);
  return (
    <form action={action} className="mt-4 space-y-2">
      <button
        disabled={pending}
        className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:border-accent disabled:opacity-60"
      >
        {pending ? "Testing…" : "Test Captura connection"}
      </button>
      <p className="text-xs text-muted">Makes one read-only request. Nothing in Captura changes.</p>
      {state && <p className={state.ok ? "text-sm text-ok" : "text-sm text-risk"}>{state.message}</p>}
    </form>
  );
}
