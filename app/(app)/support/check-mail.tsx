"use client";

import { useActionState } from "react";
import { checkMail, type SupportState } from "./actions";

export function CheckMail() {
  const [state, action, pending] = useActionState<SupportState>(checkMail, null);
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
        {pending ? "Checking…" : "Check for new mail"}
      </button>
    </form>
  );
}
