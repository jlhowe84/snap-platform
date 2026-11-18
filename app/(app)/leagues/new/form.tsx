"use client";

import { useActionState } from "react";
import { createLeague, type NewState } from "./actions";

const field = "mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none";
const label = "block text-sm font-medium";

const TYPES: [string, string][] = [
  ["league", "League"], ["club", "Club"], ["swim_team", "Swim team"], ["school", "School"], ["single_team", "Single team"], ["other", "Other"],
];

export function NewLeagueForm() {
  const [state, action, pending] = useActionState<NewState, FormData>(createLeague, null);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          League name
          <input name="name" required minLength={2} maxLength={160} className={field} />
        </label>
        <label className={label}>
          Type
          <select name="org_type" defaultValue="league" className={field}>
            {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className={label}>
          Sports <span className="font-normal text-muted">(optional, separate with commas)</span>
          <input name="sports" maxLength={200} placeholder="Baseball, Softball" className={field} />
        </label>
        <label className={label}>
          Website <span className="font-normal text-muted">(optional)</span>
          <input name="website" maxLength={300} className={field} />
        </label>
      </div>
      <fieldset className="grid gap-4 border-t border-line pt-4 sm:grid-cols-3">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Main contact (optional)</legend>
        <label className={label}>
          Name
          <input name="contact_name" maxLength={160} className={field} />
        </label>
        <label className={label}>
          Email
          <input name="contact_email" type="email" maxLength={200} className={field} />
        </label>
        <label className={label}>
          Phone
          <input name="contact_phone" maxLength={40} className={field} />
        </label>
      </fieldset>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60">
          {pending ? "Adding…" : "Add league"}
        </button>
        {state && !state.ok && <p className="text-sm text-risk">{state.message}</p>}
      </div>
    </form>
  );
}
