"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { checkOrders, linkGallery, unlinkJob, type OrdersState } from "./actions";

const MAX_FAILURES = 3;

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
      // A batch that fails on the way (a dropped connection, a slow answer)
      // is tried again a few times; the server saves its place after every
      // page, so nothing read is lost.
      let failures = 0;
      let next: OrdersState = null;
      do {
        try {
          next = await checkOrders();
          failures = 0;
        } catch {
          failures += 1;
          next = { ok: false, message: "A batch did not finish. Trying again…", more: true };
          if (failures >= MAX_FAILURES) next = { ok: false, message: "Captura did not answer in time. Try again in a few minutes; it picks up where it stopped." };
        }
        setState(next);
      } while (again && next?.more && failures < MAX_FAILURES && (next.ok || failures > 0) && !stopped.current);
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

export type JobOption = { id: string; label: string };

/**
 * Picks the job a gallery belongs to. Jobs of one league share a name, so
 * each shows its photo day, and the ones that look like this gallery's come
 * first.
 */
export function LinkGallery({ galleryId, likely, jobs, another }: { galleryId: number; likely: JobOption[]; jobs: JobOption[]; another?: boolean }) {
  const [state, action, pending] = useActionState<OrdersState, FormData>(linkGallery, null);
  useToast(state);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="gallery" value={galleryId} />
      <select
        name="job"
        required
        defaultValue={!another && likely.length > 0 && likely.every((o) => o.label.split(" · ")[0] === likely[0].label.split(" · ")[0]) ? likely[0].id : ""}
        aria-label={another ? "Another job for this gallery" : "Job for this gallery"}
        className="min-h-10 w-full max-w-[22rem] rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
      >
        <option value="">{another ? "Add another job…" : likely.length ? "Pick the job…" : "No likely match. Pick the job…"}</option>
        {likely.length > 0 && (
          <optgroup label="Likely matches">
            {likely.map((j) => (
              <option key={j.id} value={j.id}>
                {j.label}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="All jobs, newest photo day first">
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.label}
            </option>
          ))}
        </optgroup>
      </select>
      <button disabled={pending} className="min-h-10 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent disabled:opacity-60">
        {pending ? "Saving…" : another ? "Add" : "Link"}
      </button>
    </form>
  );
}

/** Takes one job off its gallery. */
export function UnlinkJob({ jobId, label }: { jobId: string; label: string }) {
  const [state, action, pending] = useActionState<OrdersState, FormData>(unlinkJob, null);
  useToast(state);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="job" value={jobId} />
      <button disabled={pending} aria-label={`Unlink ${label}`} className="text-xs text-muted underline hover:text-risk disabled:opacity-60">
        {pending ? "Removing…" : "Unlink"}
      </button>
    </form>
  );
}
