"use client";

import { useActionState } from "react";
import { saveMoneyTerms, type TermsState } from "./actions";

const field = "mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none";

export type MoneyTerms = {
  sponsorship: string | null;
  rebate: string | null;
  parent_discount: string | null;
  other_terms: string | null;
};

export const MONEY_TERM_FIELDS: { name: keyof MoneyTerms; label: string; hint: string }[] = [
  { name: "sponsorship", label: "Sponsorship", hint: "What SNAP gives the league, and when" },
  { name: "rebate", label: "Rebate", hint: "Share of sales or amount per player, and when it is paid" },
  { name: "parent_discount", label: "Parent discount", hint: "Any discount or coupon promised to families" },
  { name: "other_terms", label: "Other money terms", hint: "Donations, covered fees or anything else agreed" },
];

export function MoneyTermsForm({ orgId, terms }: { orgId: string; terms: MoneyTerms }) {
  const [state, action, pending] = useActionState<TermsState, FormData>(saveMoneyTerms.bind(null, orgId), null);
  return (
    <form action={action} className="space-y-3">
      {MONEY_TERM_FIELDS.map((f) => (
        <label key={f.name} className="block text-xs text-muted">
          {f.label}
          <textarea name={f.name} defaultValue={terms[f.name] ?? ""} rows={2} placeholder={f.hint} className={field} />
        </label>
      ))}
      <div className="flex items-center gap-3">
        <button
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state && <p className={state.ok ? "text-xs text-ok" : "text-xs text-risk"}>{state.message}</p>}
      </div>
    </form>
  );
}
