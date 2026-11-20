"use client";

import { useActionState } from "react";
import { useToast } from "@/components/toast";
import { saveSavedReply, type SupportState } from "../actions";

const field = "mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm";
const label = "block text-xs font-semibold uppercase tracking-[0.14em] text-muted";

export function SavedReplyForm({ reply }: { reply?: { id: string; title: string; body: string; category: string | null } }) {
  const [state, action, pending] = useActionState<SupportState, FormData>(saveSavedReply.bind(null, reply?.id ?? null), null);
  useToast(state);
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className={`${label} md:col-span-2`}>
          Title
          <input name="title" defaultValue={reply?.title ?? ""} required maxLength={120} className={field} />
        </label>
        <label className={label}>
          About
          <input name="category" defaultValue={reply?.category ?? ""} maxLength={60} placeholder="Order, gallery…" className={field} />
        </label>
      </div>
      <label className={label}>
        Text
        <textarea name="body" defaultValue={reply?.body ?? ""} required rows={reply ? 6 : 5} maxLength={10000} className={field} />
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60">
          {pending ? "Saving…" : reply ? "Save changes" : "Add saved reply"}
        </button>
        {state && (
          <p role="status" className={state.ok ? "text-sm text-muted" : "text-sm text-risk"}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
