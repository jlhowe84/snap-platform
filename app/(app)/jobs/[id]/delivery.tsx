"use client";

import { useActionState, useState, useTransition } from "react";
import { toast, useToast } from "@/components/toast";
import {
  addLesson,
  addObligation,
  closeObligation,
  draftCloseoutNow,
  markGalleriesLive,
  reopenObligation,
  updateObligation,
  workOutObligations,
  type DeliveryState,
} from "./delivery-actions";

const input = "min-h-12 rounded-lg border border-line bg-bg px-3 py-2 text-base text-text focus:border-accent focus:outline-none sm:min-h-0 sm:text-sm";
const primary = "min-h-12 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60 sm:min-h-0";
const secondary = "min-h-12 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:border-accent disabled:opacity-60 sm:min-h-0";

/** The tick that announces the galleries, with the order deadline the notice names. */
export function GalleryLiveForm({ jobId, defaultDeadline }: { jobId: string; defaultDeadline: string | null }) {
  const [state, action, pending] = useActionState<DeliveryState, FormData>(markGalleriesLive.bind(null, jobId), null);
  useToast(state);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="text-sm">
        <span className="mb-1 block text-muted">Order deadline (optional)</span>
        <input type="date" name="order_deadline" defaultValue={defaultDeadline ?? ""} className={input} />
      </label>
      <button disabled={pending} className={primary}>
        {pending ? "Drafting…" : "Galleries are live"}
      </button>
      {state && !state.ok && <p className="w-full text-sm text-risk">{state.message}</p>}
    </form>
  );
}

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<DeliveryState>) =>
    start(async () => {
      const r = await fn();
      if (r) toast(r.ok, r.message);
    });
  return [pending, run] as const;
}

export function CloseoutButtons({ jobId, closedOut }: { jobId: string; closedOut: boolean }) {
  const [pending, run] = useRun();
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={pending} onClick={() => run(() => workOutObligations(jobId))} className={secondary}>
        Work out amounts owed
      </button>
      {!closedOut && (
        <button type="button" disabled={pending} onClick={() => run(() => draftCloseoutNow(jobId))} className={secondary}>
          Draft close-out now
        </button>
      )}
    </div>
  );
}

export type ObligationView = {
  id: string;
  kindLabel: string;
  title: string;
  owedIn: boolean;
  amount: number | null;
  dueOn: string | null;
  dueLabel: string | null;
  ownerId: string | null;
  status: string;
  explain: string | null;
  basis: string | null;
  closedNote: string | null;
  quickbooksRef: string | null;
  closedLine: string | null;
};

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function ObligationRow({ o, staff }: { o: ObligationView; staff: { id: string; name: string }[] }) {
  const [mode, setMode] = useState<"view" | "edit" | "close">("view");
  const [saveState, save, saving] = useActionState<DeliveryState, FormData>(updateObligation.bind(null, o.id), null);
  const [closeState, close, closing] = useActionState<DeliveryState, FormData>(closeObligation.bind(null, o.id), null);
  const [pending, run] = useRun();
  useToast(saveState);
  useToast(closeState);
  const open = o.status === "open";

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="min-w-0">
          <span className="text-xs uppercase tracking-wide text-muted">{o.kindLabel}</span>{" "}
          <span className={open ? "font-semibold" : "font-semibold text-muted line-through"}>{o.title}</span>
        </span>
        <span className="text-sm font-semibold tabular-nums">
          {o.amount === null ? <span className="text-warn">Amount needed</span> : `${o.owedIn ? "They owe " : ""}${usd(o.amount)}`}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        {[o.dueLabel ? `Due ${o.dueLabel}` : "No due date", staff.find((s) => s.id === o.ownerId)?.name ?? "No owner", o.explain ?? (o.basis && o.basis !== o.title ? `From "${o.basis}"` : null)]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {!open && o.closedLine && <p className="mt-1 text-xs text-muted">{o.closedLine}</p>}

      {open && mode === "view" && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          <button type="button" onClick={() => setMode("edit")} className="min-h-12 text-muted hover:text-accent sm:min-h-0">
            Change
          </button>
          <button type="button" onClick={() => setMode("close")} className="min-h-12 text-muted hover:text-accent sm:min-h-0">
            Close
          </button>
        </div>
      )}
      {!open && (
        <button type="button" disabled={pending} onClick={() => run(() => reopenObligation(o.id))} className="mt-1 min-h-12 text-xs text-muted hover:text-accent sm:min-h-0">
          Reopen
        </button>
      )}

      {open && mode === "edit" && (
        <form action={save} className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-xs">
            <span className="mb-1 block text-muted">Amount</span>
            <input name="amount" type="number" step="0.01" min="0" defaultValue={o.amount ?? ""} className={input + " w-32"} />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted">Due</span>
            <input name="due_on" type="date" defaultValue={o.dueOn ?? ""} className={input} />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted">Owner</span>
            <select name="owner_id" defaultValue={o.ownerId ?? ""} className={input}>
              <option value="">No owner</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button disabled={saving} className={primary}>
            Save
          </button>
          <button type="button" onClick={() => setMode("view")} className={secondary}>
            Done
          </button>
        </form>
      )}

      {open && mode === "close" && (
        <form action={close} className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-xs">
            <span className="mb-1 block text-muted">Note</span>
            <input name="closed_note" maxLength={1000} placeholder="Check 1041 mailed 6/2" className={input + " w-56"} />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted">QuickBooks reference</span>
            <input name="quickbooks_ref" maxLength={200} className={input + " w-40"} />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted">Outcome</span>
            <select name="outcome" className={input}>
              <option value="closed">Paid or done</option>
              <option value="void">Not owed after all</option>
            </select>
          </label>
          <button disabled={closing} className={primary}>
            Close it
          </button>
          <button type="button" onClick={() => setMode("view")} className={secondary}>
            Cancel
          </button>
          {closeState && !closeState.ok && <p className="w-full text-sm text-risk">{closeState.message}</p>}
        </form>
      )}
    </li>
  );
}

export function AddObligationForm({ jobId, kinds }: { jobId: string; kinds: [string, string][] }) {
  const [state, action, pending] = useActionState<DeliveryState, FormData>(addObligation.bind(null, jobId), null);
  useToast(state);
  return (
    <details className="mt-3">
      <summary className="min-h-12 cursor-pointer text-sm text-muted hover:text-accent sm:min-h-0">Add one by hand</summary>
      <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="mb-1 block text-muted">Kind</span>
          <select name="kind" className={input}>
            {kinds.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted">What</span>
          <input name="title" required maxLength={200} placeholder="Donation to the league's fund" className={input + " w-56"} />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted">Amount</span>
          <input name="amount" type="number" step="0.01" min="0" className={input + " w-28"} />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted">Due</span>
          <input name="due_on" type="date" className={input} />
        </label>
        <button disabled={pending} className={primary}>
          Add
        </button>
        {state && !state.ok && <p className="w-full text-sm text-risk">{state.message}</p>}
      </form>
    </details>
  );
}

export function LessonForm({ jobId }: { jobId: string }) {
  const [state, action, pending] = useActionState<DeliveryState, FormData>(addLesson.bind(null, jobId), null);
  useToast(state);
  return (
    <form action={action} className="space-y-2">
      <textarea
        name="body"
        required
        maxLength={2000}
        rows={2}
        placeholder="A lesson for next season: what to do differently with this league."
        className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-base text-text focus:border-accent focus:outline-none sm:text-sm"
      />
      <button disabled={pending} className={secondary}>
        {pending ? "Saving…" : "Save lesson to the league page"}
      </button>
    </form>
  );
}
