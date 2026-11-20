"use client";

import { useActionState } from "react";
import { useToast } from "@/components/toast";
import { addStep, saveStep, type StepState } from "./actions";

export type StepValues = {
  name: string;
  stage: string | null;
  owner_hint: string | null;
  description: string | null;
  offset_days: number | null;
  captura: boolean;
  active: boolean;
};

const field = "rounded-lg border border-line bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none";
const label = "flex flex-col gap-1 text-xs text-muted";

const EMPTY: StepValues = { name: "", stage: null, owner_hint: null, description: null, offset_days: null, captura: false, active: true };

// One form for both: editing a step (stepId) or adding one to a list (playbookId).
export function StepForm({
  stepId,
  playbookId,
  values = EMPTY,
  stages,
  listId,
}: {
  stepId?: string;
  playbookId?: string;
  values?: StepValues;
  stages: string[];
  listId: string;
}) {
  const run = stepId ? saveStep.bind(null, stepId) : addStep.bind(null, playbookId ?? "");
  const [state, action, pending] = useActionState<StepState, FormData>(run, null);
  useToast(state);
  const adding = !stepId;

  return (
    // After a step is added the form is remounted empty, ready for the next one.
    <form action={action} key={adding && state?.ok ? "added" : "form"} className="space-y-3">
      <label className={label}>
        Step
        <input name="name" required maxLength={200} defaultValue={values.name} className={field} />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={label}>
          Stage
          <input name="stage" list={listId} maxLength={60} defaultValue={values.stage ?? ""} className={field} placeholder="Pre-Planning" />
        </label>
        <label className={label}>
          Who does it
          <input name="owner_hint" maxLength={120} defaultValue={values.owner_hint ?? ""} className={field} placeholder="Office" />
        </label>
      </div>
      <datalist id={listId}>
        {stages.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <div className="flex flex-wrap items-end gap-2">
        <label className={label}>
          Due
          <input
            name="days"
            type="number"
            min={0}
            max={365}
            step={1}
            defaultValue={values.offset_days == null ? "" : Math.abs(values.offset_days)}
            className={`${field} w-24`}
            placeholder="none"
          />
        </label>
        <label className={label}>
          <span className="sr-only">Before or after photo day</span>
          <select name="when" defaultValue={(values.offset_days ?? -1) > 0 ? "after" : "before"} className={field}>
            <option value="before">days before photo day</option>
            <option value="after">days after photo day</option>
          </select>
        </label>
        <p className="pb-2 text-xs text-muted">Leave the number empty for no due date.</p>
      </div>
      <label className={label}>
        Notes for whoever does it
        <textarea name="description" rows={2} maxLength={2000} defaultValue={values.description ?? ""} className={`${field} resize-y`} />
      </label>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="captura" defaultChecked={values.captura} /> Show on the job&apos;s Captura setup list
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={values.active} /> In use
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60">
          {pending ? "Saving…" : adding ? "Add step" : "Save step"}
        </button>
        {state && <p role="status" className={state.ok ? "text-sm text-ok" : "text-sm text-risk"}>{state.message}</p>}
      </div>
    </form>
  );
}
