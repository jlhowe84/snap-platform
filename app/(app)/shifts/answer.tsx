"use client";

import { useActionState } from "react";
import { useToast } from "@/components/toast";
import { answerShift, type ShiftAnswer } from "./actions";

export function Answer({ shiftId }: { shiftId: string }) {
  const [taken, take, taking] = useActionState<ShiftAnswer, FormData>(answerShift.bind(null, shiftId, true), null);
  useToast(taken);
  const [passed, pass, passing] = useActionState<ShiftAnswer, FormData>(answerShift.bind(null, shiftId, false), null);
  useToast(passed);
  const state = taken ?? passed;
  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <form action={take} className="flex-1">
          <button disabled={taking || passing} className="w-full rounded-lg bg-accent px-4 py-3 text-base font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60">
            {taking ? "Taking it…" : "I'll take it"}
          </button>
        </form>
        <form action={pass}>
          <button disabled={taking || passing} className="rounded-lg border border-line px-4 py-3 text-base hover:bg-surface-2 disabled:opacity-60">
            {passing ? "…" : "Can't"}
          </button>
        </form>
      </div>
      {state && <p role="status" className={state.ok ? "mt-2 text-sm text-muted" : "mt-2 text-sm text-risk"}>{state.message}</p>}
    </div>
  );
}
