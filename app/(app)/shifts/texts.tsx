"use client";

import { useActionState, useState } from "react";
import { answerTexts, type TextsState } from "./actions";

export type TextConsent = { opted_in: boolean; phone: string | null; at: string } | null;

const field = "min-h-12 w-full rounded-lg border border-line bg-bg px-3 py-2 text-base text-text focus:border-accent focus:outline-none";
const quiet = "min-h-12 rounded-lg border border-line px-4 text-sm hover:bg-surface-2 disabled:opacity-60";

// The crew member's answer on shift texts. A first visit asks; after that the
// card shows the answer and a way to change it.
export function TextsCard({ consent, wording, phoneOnFile, phoneShown }: { consent: TextConsent; wording: string; phoneOnFile: string; phoneShown: string }) {
  const [changing, setChanging] = useState(false);
  const [state, action, saving] = useActionState<TextsState, FormData>(async (prev, form) => {
    const result = await answerTexts(prev, form);
    if (result?.ok) setChanging(false);
    return result;
  }, null);
  const asking = !consent || changing;

  return (
    <section className="mb-8 rounded-xl border border-line bg-surface p-4">
      <h2 className="font-display text-lg font-semibold uppercase tracking-wider text-muted">Shift texts</h2>
      {!asking && (
        <>
          <p className="mt-2 text-sm">
            {consent.opted_in ? (
              <>
                Texts about your shifts go to <span className="font-semibold">{phoneShown}</span>.
              </>
            ) : (
              "You said no to shift texts. Email notices still come."
            )}
          </p>
          <form action={action} className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setChanging(true)} className={quiet}>
              {consent.opted_in ? "Change number" : "Get shift texts"}
            </button>
            {consent.opted_in && (
              <button name="intent" value="no" disabled={saving} className={quiet}>
                {saving ? "Saving…" : "Stop shift texts"}
              </button>
            )}
          </form>
        </>
      )}
      {asking && (
        <form action={action} className="mt-3 space-y-3">
          <div>
            <label htmlFor="text-phone" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
              Mobile number
            </label>
            <input id="text-phone" name="phone" type="tel" autoComplete="tel" maxLength={40} defaultValue={phoneOnFile} className={field} />
          </div>
          <label className="flex min-h-12 items-start gap-3 text-sm">
            <input type="checkbox" name="agree" value="yes" className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]" />
            <span>{wording}</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button name="intent" value="yes" disabled={saving} className="min-h-12 rounded-lg bg-accent px-4 text-base font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60">
              {saving ? "Saving…" : "Yes, text me"}
            </button>
            {consent ? (
              <button type="button" onClick={() => setChanging(false)} className="min-h-12 rounded-lg px-4 text-sm text-muted hover:bg-surface-2">
                Cancel
              </button>
            ) : (
              <button name="intent" value="no" disabled={saving} className={quiet}>
                No thanks
              </button>
            )}
          </div>
        </form>
      )}
      {state && <p role="status" className={`mt-3 text-sm ${state.ok ? "text-muted" : "text-risk"}`}>{state.message}</p>}
    </section>
  );
}
