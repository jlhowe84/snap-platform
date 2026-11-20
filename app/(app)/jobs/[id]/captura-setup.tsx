"use client";

import { useActionState, useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { saveCoupon, setSetupStep, type CouponState } from "./setup-actions";

type Step = { id: string; name: string; stage: string | null; due: string | null; late: boolean; done: boolean };
type Value = { label: string; hint: string; value: string | null; missing?: string };

export function CapturaSetup({
  jobId,
  steps,
  values,
  coupon,
  canEdit,
}: {
  jobId: string;
  steps: Step[];
  values: Value[];
  coupon: string | null;
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);
  const [state, action, saving] = useActionState<CouponState, FormData>(saveCoupon.bind(null, jobId), null);
  useToast(state);

  return (
    <div className="space-y-5">
      {steps.length ? (
        <ul className="divide-y divide-line">
          {steps.map((s) => (
            <li key={s.id} className="py-2">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={s.done}
                  disabled={!canEdit || pending}
                  onChange={(e) => {
                    const done = e.target.checked;
                    start(() => setSetupStep(jobId, s.id, done));
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className={s.done ? "text-muted line-through" : undefined}>{s.name}</span>
                  <span className={`block text-xs ${s.late && !s.done ? "text-risk" : "text-muted"}`}>
                    {[s.stage, s.due ? `due ${s.due}` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No planning steps are marked for Captura yet.</p>
      )}

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Values to paste into Captura</h3>
        {canEdit && (
          <form action={action} className="mb-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Coupon code
              <input
                name="coupon"
                defaultValue={coupon ?? ""}
                maxLength={40}
                className="w-40 rounded-lg border border-line bg-bg px-3 py-2 font-mono text-sm uppercase focus:border-accent focus:outline-none"
              />
            </label>
            <button disabled={saving} className="rounded-lg border border-line px-3 py-2 text-sm hover:border-accent hover:text-accent disabled:opacity-60">
              {saving ? "Saving…" : "Save"}
            </button>
            {state && <span className={state.ok ? "text-sm text-ok" : "text-sm text-risk"}>{state.message}</span>}
          </form>
        )}
        <ul className="space-y-3">
          {values.map((v) => (
            <li key={v.label} className="text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <p>
                  <span className="font-medium">{v.label}</span> <span className="text-muted">· {v.hint}</span>
                </p>
                {v.value && (
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(v.value!).then(() => setCopied(v.label))}
                    className="shrink-0 rounded border border-line px-3 py-1 text-xs hover:bg-surface-2"
                  >
                    {copied === v.label ? "Copied" : "Copy"}
                  </button>
                )}
              </div>
              {v.value ? (
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-bg px-2 py-1 font-mono text-xs">{v.value}</pre>
              ) : (
                <p className="mt-1 text-xs text-muted">{v.missing}</p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
