"use client";

import { useActionState } from "react";
import { addPayLines, type PayRunState } from "./actions";

export function AddPay({ from, to }: { from: string; to: string }) {
  const [state, action, pending] = useActionState<PayRunState, FormData>(addPayLines, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <button disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60">
        {pending ? "Adding…" : "Add pay for shifts worked in these dates"}
      </button>
      {state && <p role="status" className={state.ok ? "text-sm text-muted" : "text-sm text-risk"}>{state.message}</p>}
    </form>
  );
}
