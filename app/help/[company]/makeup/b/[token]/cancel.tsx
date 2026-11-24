"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { cancelMakeup, type BookState } from "../../actions";

/** Cancel, with a second tap so it is never done by accident. */
export function CancelBooking({ token }: { token: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [state, action, pending] = useActionState<BookState>(async () => {
    const result = await cancelMakeup(token);
    if (result?.ok) router.refresh();
    return result;
  }, null);
  const quiet = "min-h-12 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold hover:border-accent";
  return (
    <section className="mt-6">
      {!asking ? (
        <button type="button" onClick={() => setAsking(true)} className={quiet}>
          Cancel this session
        </button>
      ) : (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <button disabled={pending} className="min-h-12 rounded-lg bg-risk px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60">
            {pending ? "Cancelling…" : "Yes, cancel it"}
          </button>
          <button type="button" onClick={() => setAsking(false)} className={quiet}>
            Keep it
          </button>
        </form>
      )}
      {state && !state.ok && <p role="alert" className="mt-2 text-sm font-medium text-risk">{state.message}</p>}
      <p className="mt-2 text-xs text-muted">You can cancel any time before the session starts.</p>
    </section>
  );
}
