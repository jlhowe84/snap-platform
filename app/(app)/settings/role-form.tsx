"use client";

import { useActionState } from "react";
import { useToast } from "@/components/toast";
import { ROLE_LABEL } from "@/lib/labels";
import type { Grantable } from "@/lib/team/roles";
import { saveRoles, type InviteState } from "./actions";

/** Tick or untick one team member's roles. */
export function RoleForm({ profileId, name, current, editable }: { profileId: string; name: string; current: string[]; editable: Grantable[] }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(saveRoles.bind(null, profileId), null);
  useToast(state);
  return (
    <details className="w-full">
      <summary className="flex min-h-12 cursor-pointer items-center text-sm text-accent hover:underline sm:min-h-8">Change roles</summary>
      <form action={action} className="mt-1 space-y-2 rounded-lg border border-line p-3">
        <fieldset className="flex flex-wrap gap-x-5 gap-y-1">
          <legend className="sr-only">Roles for {name}</legend>
          {editable.map((r) => (
            <label key={r} className="flex min-h-12 items-center gap-2 text-sm sm:min-h-8">
              <input type="checkbox" name="roles" value={r} defaultChecked={current.includes(r)} className="h-5 w-5 accent-[var(--accent)]" />
              {ROLE_LABEL[r]}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={pending} className="min-h-12 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60 sm:min-h-0">
            {pending ? "Saving…" : "Save roles"}
          </button>
          {state && !state.ok && <p className="text-sm text-risk">{state.message}</p>}
        </div>
      </form>
    </details>
  );
}
