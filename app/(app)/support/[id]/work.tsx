"use client";

import { useActionState } from "react";
import { addNote, saveConversation, type SupportState } from "../actions";
import { SUPPORT_STATUSES, SUPPORT_STATUS_LABEL, type SupportStatus } from "@/lib/support/labels";

const field = "mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm";
const label = "block text-xs font-semibold uppercase tracking-[0.14em] text-muted";

function Message({ state }: { state: SupportState }) {
  if (!state) return null;
  return (
    <p role="status" className={state.ok ? "text-sm text-muted" : "text-sm text-risk"}>
      {state.message}
    </p>
  );
}

export function WorkForm({
  id,
  status,
  assigneeId,
  category,
  people,
  categories,
}: {
  id: string;
  status: SupportStatus;
  assigneeId: string | null;
  category: string | null;
  people: { id: string; name: string }[];
  categories: string[];
}) {
  const [state, action, pending] = useActionState<SupportState, FormData>(saveConversation.bind(null, id), null);
  return (
    <form action={action} className="space-y-4">
      <label className={label}>
        Status
        <select name="status" defaultValue={status} className={field}>
          {SUPPORT_STATUSES.map((s) => (
            <option key={s} value={s}>{SUPPORT_STATUS_LABEL[s]}</option>
          ))}
        </select>
      </label>
      <label className={label}>
        Assigned to
        <select name="assignee" defaultValue={assigneeId ?? ""} className={field}>
          <option value="">Nobody yet</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>
      <label className={label}>
        About
        <input name="category" defaultValue={category ?? ""} maxLength={60} list="support-categories" placeholder="Order, gallery, refund…" className={field} />
        <datalist id="support-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function NoteForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<SupportState, FormData>(addNote.bind(null, id), null);
  return (
    <form action={action} className="space-y-2">
      <label className={label}>
        Add a note for the team
        <textarea name="body" rows={3} maxLength={5000} required placeholder="Only staff see notes. The customer never does." className={field} />
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:border-accent hover:text-accent disabled:opacity-60">
          {pending ? "Adding…" : "Add note"}
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}
