"use client";

import { useActionState, useState } from "react";
import { useToast } from "@/components/toast";
import { removeStep, type StepState } from "./actions";

// Two clicks to remove a step, so one slip of the mouse cannot do it.
export function RemoveStep({ stepId, name }: { stepId: string; name: string }) {
  const [asking, setAsking] = useState(false);
  const [state, action, pending] = useActionState<StepState, FormData>(removeStep.bind(null, stepId), null);
  useToast(state);

  return (
    <div className="mt-3 border-t border-line pt-3 text-sm">
      {asking ? (
        <form action={action} className="flex flex-wrap items-center gap-3">
          <span className="text-muted">Remove &ldquo;{name}&rdquo; for good?</span>
          <button disabled={pending} className="rounded-lg border border-risk px-3 py-1.5 font-semibold text-risk hover:bg-risk/10 disabled:opacity-60">
            {pending ? "Removing…" : "Yes, remove it"}
          </button>
          <button type="button" onClick={() => setAsking(false)} className="text-muted hover:text-text">
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setAsking(true)} className="text-muted underline-offset-2 hover:text-risk hover:underline">
          Remove this step
        </button>
      )}
      {state && !state.ok && (
        <p role="status" className="mt-2 text-risk">
          {state.message}
        </p>
      )}
    </div>
  );
}
