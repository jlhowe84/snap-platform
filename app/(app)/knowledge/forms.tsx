"use client";

import { useActionState } from "react";
import { importArticles, saveArticle, type KbState } from "./actions";
import { KB_SHELVES, KB_STATUSES, SHELF_LABEL, STATUS_LABEL, type KbShelf, type KbStatus } from "@/lib/kb/labels";

const field = "mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm";
const label = "block text-xs font-semibold uppercase tracking-[0.14em] text-muted";
const button = "rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60";

function Status({ state }: { state: KbState }) {
  if (!state) return null;
  return (
    <p role="status" className={state.ok ? "text-sm text-muted" : "text-sm text-risk"}>
      {state.message}
    </p>
  );
}

export type ArticleFields = { id: string; title: string; section: string | null; shelf: KbShelf; status: KbStatus; body: string };

export function ArticleForm({ article, sections, shelf }: { article?: ArticleFields; sections: string[]; shelf?: KbShelf }) {
  const [state, action, pending] = useActionState<KbState, FormData>(saveArticle.bind(null, article?.id ?? null), null);
  return (
    <form action={action} className="space-y-3">
      <label className={label}>
        Title or question
        <input name="title" defaultValue={article?.title ?? ""} required maxLength={200} className={field} />
      </label>
      <div className="grid gap-3 md:grid-cols-3">
        <label className={label}>
          Shelf
          <select name="shelf" defaultValue={article?.shelf ?? shelf ?? "answers"} className={field}>
            {KB_SHELVES.map((s) => (
              <option key={s} value={s}>{SHELF_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          Section
          <input name="section" list="kb-sections" defaultValue={article?.section ?? ""} maxLength={120} className={field} />
          <datalist id="kb-sections">
            {sections.map((s) => <option key={s} value={s} />)}
          </datalist>
        </label>
        <label className={label}>
          Status
          <select name="status" defaultValue={article?.status ?? "published"} className={field}>
            {KB_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </label>
      </div>
      <label className={label}>
        Text
        <textarea name="body" defaultValue={article?.body ?? ""} required rows={article ? 14 : 10} maxLength={20000} className={`${field} font-mono`} />
      </label>
      <p className="text-xs text-muted">
        Plain text with light formatting: **bold**, *italics*, lines starting with - for a list, and &gt; for a quoted template. Never put a
        real order fact here; write a slot like [GALLERY LINK] for the person sending to fill in.
      </p>
      <div className="flex items-center gap-3">
        <button disabled={pending} className={button}>{pending ? "Saving…" : article ? "Save changes" : "Add article"}</button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function ImportForm() {
  const [state, action, pending] = useActionState<KbState, FormData>(importArticles, null);
  return (
    <form action={action} className="space-y-3">
      <label className={label}>
        The document&apos;s text (Markdown)
        <textarea name="markdown" required rows={16} className={`${field} font-mono`} placeholder={"## 3. Photo Day\n\n### What if it rains?\n\nWe reschedule…"} />
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <label className={label}>
          Leave out these sections
          <input name="skip" defaultValue="Maintenance" maxLength={500} className={field} placeholder="Comma between names" />
        </label>
        <label className={label}>
          Add them as
          <select name="status" defaultValue="published" className={field}>
            <option value="published">Published</option>
            <option value="draft">Drafts to review first</option>
          </select>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button disabled={pending} className={button}>{pending ? "Importing…" : "Import"}</button>
        <Status state={state} />
      </div>
    </form>
  );
}
