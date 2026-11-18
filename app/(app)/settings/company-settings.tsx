"use client";

import { useActionState } from "react";
import { EDITABLE_SETTINGS } from "@/lib/settings/editable";
import { saveCompanySettings, type SettingsState } from "./actions";

export function CompanySettingsForm({ values }: { values: Record<string, number | null> }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveCompanySettings, null);
  return (
    <form action={action} className="space-y-6">
      {EDITABLE_SETTINGS.map((g) => (
        <fieldset key={g.group}>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{g.group}</legend>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
            {g.items.map((s) => (
              <label key={s.key} className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{s.label}</span>
                <span className="flex items-center gap-2">
                  <input
                    name={s.key}
                    type="number"
                    min={s.min}
                    max={s.max}
                    step={1}
                    required
                    defaultValue={values[s.key] ?? ""}
                    className="w-24 rounded-lg border border-line bg-surface px-3 py-2"
                  />
                  <span className="text-muted">{s.unit}</span>
                </span>
                <span className="text-xs text-muted">{s.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60">
          {pending ? "Saving…" : "Save settings"}
        </button>
        {state && <p role="status" className={state.ok ? "text-sm text-ok" : "text-sm text-risk"}>{state.message}</p>}
      </div>
    </form>
  );
}
