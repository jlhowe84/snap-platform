"use client";

import { useActionState } from "react";
import { useToast } from "@/components/toast";
import { buildBoard, draftOffers, holdDate, releaseHold, type BoardState } from "./actions";

const field = "rounded-lg border border-line bg-bg px-2 py-1.5 text-sm focus:border-accent focus:outline-none";
const primary =
  "rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60";

function Note({ state }: { state: BoardState }) {
  if (!state) return null;
  return <p className={state.ok ? "text-xs text-ok" : "text-xs text-risk"}>{state.message}</p>;
}

export function BuildBoardButton({ season }: { season: string }) {
  const [state, action, pending] = useActionState<BoardState, FormData>(() => buildBoard(season), null);
  useToast(state);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <button disabled={pending} className={primary}>
        {pending ? "Building…" : "Add returning leagues"}
      </button>
      <Note state={state} />
    </form>
  );
}

export function HoldForm({
  offerId,
  suggestedDate,
  stations,
  minDate,
  maxDate,
  canOverride,
}: {
  offerId: string;
  suggestedDate: string;
  stations: number;
  minDate: string;
  maxDate: string;
  canOverride: boolean;
}) {
  const [state, action, pending] = useActionState<BoardState, FormData>(holdDate, null);
  useToast(state);
  return (
    <form action={action} className="mt-2 space-y-1">
      <input type="hidden" name="offer_id" value={offerId} />
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" name="date" defaultValue={suggestedDate} min={minDate} max={maxDate} required className={field} />
        <label className="flex items-center gap-1 text-xs text-muted">
          <input type="number" name="stations" defaultValue={stations} min={1} max={20} className={`${field} w-14`} />
          stations
        </label>
        <button disabled={pending} className={primary}>
          {pending ? "Holding…" : "Hold"}
        </button>
      </div>
      {canOverride && (
        <label className="flex items-center gap-1 text-xs text-muted">
          <input type="checkbox" name="override" className="accent-[var(--accent)]" /> Allow over capacity
        </label>
      )}
      <Note state={state} />
    </form>
  );
}

export function ReleaseForm({ holdId }: { holdId: string }) {
  const [state, action, pending] = useActionState<BoardState, FormData>(releaseHold, null);
  useToast(state);
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-muted hover:text-text">Release</summary>
      <form action={action} className="mt-2 space-y-2">
        <input type="hidden" name="hold_id" value={holdId} />
        <select name="stage" className={field} defaultValue="no_reply">
          <option value="no_reply">No reply</option>
          <option value="declined">Declined</option>
          <option value="offered">Still talking (back to offered)</option>
        </select>
        <input name="reason" placeholder="Why (optional)" className={`${field} w-full`} />
        <button disabled={pending} className="rounded-lg border border-risk/50 px-3 py-1 text-risk hover:bg-surface-2">
          {pending ? "Releasing…" : "Release the date"}
        </button>
        <Note state={state} />
      </form>
    </details>
  );
}

export function DraftOffersButton({ season, offerId, label }: { season: string; offerId?: string; label: string }) {
  const [state, action, pending] = useActionState<BoardState, FormData>(() => draftOffers(season, offerId ?? null), null);
  useToast(state);
  return (
    <form action={action} className={offerId ? "mt-2" : "flex flex-col items-end gap-1"}>
      <button
        disabled={pending}
        className={
          offerId
            ? "text-xs text-accent hover:underline disabled:opacity-60"
            : "rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-60"
        }
      >
        {pending ? "Drafting…" : label}
      </button>
      <Note state={state} />
    </form>
  );
}
