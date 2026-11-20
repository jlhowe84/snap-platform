"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { checkOrders, linkGallery, type OrdersState } from "./actions";

/**
 * Reads Captura orders now. While older orders are still loading it keeps
 * going on its own, one batch after another, until the history is in or the
 * person presses Stop.
 */
export function CheckOrders({ loading }: { loading: boolean }) {
  const [state, setState] = useState<OrdersState>(null);
  const [pending, start] = useTransition();
  const [keepGoing, setKeepGoing] = useState(false);
  const stopped = useRef(false);
  useToast(keepGoing ? null : state);

  function run(again: boolean) {
    stopped.current = false;
    setKeepGoing(again);
    start(async () => {
      let next = await checkOrders();
      setState(next);
      while (again && next?.ok && next.more && !stopped.current) {
        next = await checkOrders();
        setState(next);
      }
      setKeepGoing(false);
    });
  }

  useEffect(() => () => void (stopped.current = true), []);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {state && (
        <p role="status" className={state.ok ? "text-sm text-muted" : "text-sm text-risk"}>
          {state.message}
        </p>
      )}
      {pending && keepGoing ? (
        <button
          type="button"
          onClick={() => (stopped.current = true)}
          className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:border-accent hover:text-accent"
        >
          Stop after this batch
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(loading)}
          className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:border-accent hover:text-accent disabled:opacity-60"
        >
          {pending ? "Reading orders…" : loading ? "Load the order history" : "Check for new orders"}
        </button>
      )}
    </div>
  );
}

export function LinkGallery({ galleryId, jobId, jobs }: { galleryId: number; jobId: string | null; jobs: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState<OrdersState, FormData>(linkGallery, null);
  useToast(state);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="gallery" value={galleryId} />
      <select name="job" defaultValue={jobId ?? ""} aria-label="Job for this gallery" className="max-w-[16rem] rounded-lg border border-line bg-surface px-2 py-1.5 text-sm">
        <option value="">Not linked</option>
        {jobs.map((j) => (
          <option key={j.id} value={j.id}>
            {j.label}
          </option>
        ))}
      </select>
      <button disabled={pending} className="rounded-lg border border-line px-2 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent disabled:opacity-60">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
