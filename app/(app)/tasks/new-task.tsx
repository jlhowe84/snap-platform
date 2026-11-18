"use client";

import { useActionState, useEffect, useRef } from "react";
import { addTask, type TaskState } from "./actions";

const input = "rounded-lg border border-line bg-surface px-3 py-2 text-sm";

export function NewTask({ people, me }: { people: { id: string; name: string }[]; me: string }) {
  const [state, action, pending] = useActionState<TaskState, FormData>(addTask, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="flex flex-wrap items-end gap-2">
      <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-muted">
        Task
        <input name="title" required maxLength={200} placeholder="Send the donation check" className={input} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Due
        <input name="due_on" type="date" className={input} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        For
        <select name="assignee_id" defaultValue={me} className={input}>
          <option value="">Nobody yet</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>
      <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-muted">
        Notes
        <input name="notes" maxLength={2000} className={input} />
      </label>
      <button disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60">
        {pending ? "Adding…" : "Add task"}
      </button>
      {state && !state.ok && <p className="w-full text-sm text-risk" role="alert">{state.message}</p>}
    </form>
  );
}
