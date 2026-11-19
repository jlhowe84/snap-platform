"use client";

import { useActionState, useRef, useState } from "react";
import { addNote, saveConversation, sendReply, type SupportState } from "../actions";
import { fillSavedReply } from "@/lib/support/saved";
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

export function ReplyForm({
  id,
  to,
  testMode,
  saved,
  customerName,
  myName,
}: {
  id: string;
  to: string | null;
  testMode: boolean;
  saved: { id: string; title: string; body: string }[];
  customerName: string | null;
  myName: string;
}) {
  // The text is kept here so a reply that fails to send is not lost.
  const [text, setText] = useState("");
  const [state, action, pending] = useActionState<SupportState, FormData>(async (prev, form) => {
    const result = await sendReply(id, prev, form);
    if (result?.ok) setText("");
    return result;
  }, null);
  const box = useRef<HTMLTextAreaElement>(null);

  function insert(savedId: string) {
    const reply = saved.find((r) => r.id === savedId);
    if (!reply) return;
    const filled = fillSavedReply(reply.body, { customerName, myName });
    setText((now) => (now.trim() ? `${now.replace(/\s+$/, "")}\n\n${filled}` : filled));
    box.current?.focus();
  }

  if (!to) return <p className="text-sm text-muted">This conversation has no address to reply to.</p>;
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className={label}>
          Reply to <span className="normal-case tracking-normal text-text">{to}</span>
        </p>
        {saved.length > 0 && (
          <select
            aria-label="Insert a saved reply"
            defaultValue=""
            onChange={(e) => {
              insert(e.target.value);
              e.target.value = "";
            }}
            className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm"
          >
            <option value="">Insert a saved reply…</option>
            {saved.map((r) => (
              <option key={r.id} value={r.id}>{r.title}</option>
            ))}
          </select>
        )}
      </div>
      <textarea ref={box} name="body" rows={8} maxLength={20000} required aria-label="Reply" value={text} onChange={(e) => setText(e.target.value)} className={field} />
      {testMode && (
        <p className="rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 text-sm">
          Test mode is on. Sending goes only to the test address and is kept here as a note. The customer gets nothing.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60">
          {pending ? "Sending…" : testMode ? "Send test" : "Send reply"}
        </button>
        {!testMode && (
          <label className="flex items-center gap-2 text-sm text-muted">
            Then mark it
            <select name="after" defaultValue="waiting_customer" className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm text-text">
              <option value="waiting_customer">Waiting on customer</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </label>
        )}
        <Message state={state} />
      </div>
    </form>
  );
}
