"use client";

import { useActionState } from "react";
import { useToast } from "@/components/toast";
import { inviteStaff, type InviteState } from "./actions";

const ROLES = [
  { value: "office", label: "Office" },
  { value: "support", label: "Support" },
  { value: "crew", label: "Crew" },
  { value: "admin", label: "Admin" },
];

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteStaff, null);
  useToast(state);
  return (
    <form action={action} className="space-y-3">
      <input
        name="email"
        type="email"
        required
        placeholder="name@company.com"
        className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <fieldset className="flex flex-wrap gap-3 text-sm">
        <legend className="sr-only">Roles</legend>
        {ROLES.map((r) => (
          <label key={r.value} className="inline-flex items-center gap-2">
            <input type="checkbox" name="roles" value={r.value} className="accent-[var(--accent)]" />
            {r.label}
          </label>
        ))}
      </fieldset>
      <button
        disabled={pending}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Inviting…" : "Send invite"}
      </button>
      <p className="text-xs text-muted">No email goes out. The person simply signs in with Google.</p>
      {state && <p className={state.ok ? "text-sm text-ok" : "text-sm text-risk"}>{state.message}</p>}
    </form>
  );
}
