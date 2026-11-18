"use client";

import { useActionState } from "react";
import { testCapturaConnection, testGmailConnection, type CapturaTestState, type GmailTestState } from "./actions";

function TestButton({
  label,
  action: run,
}: {
  label: string;
  action: () => Promise<CapturaTestState | GmailTestState>;
}) {
  const [state, action, pending] = useActionState<CapturaTestState | GmailTestState>(run, null);
  return (
    <form action={action} className="space-y-2">
      <button
        disabled={pending}
        className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:border-accent disabled:opacity-60"
      >
        {pending ? "Testing…" : label}
      </button>
      {state && <p className={state.ok ? "text-sm text-ok" : "text-sm text-risk"}>{state.message}</p>}
    </form>
  );
}

export function CapturaTest() {
  return (
    <div className="mt-4 space-y-3">
      <TestButton label="Test Captura connection" action={testCapturaConnection} />
      <TestButton label="Test Gmail connection" action={testGmailConnection} />
      <p className="text-xs text-muted">Each makes one read-only request. Nothing changes in Captura or Gmail.</p>
    </div>
  );
}
