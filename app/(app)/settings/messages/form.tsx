"use client";

import { useActionState, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { ConfirmButton } from "@/components/confirm-button";
import { fillTemplate, messageDef, sampleWords, templateProblem } from "@/lib/messages/catalog";
import { resetMessage, saveMessage, type MessageState } from "./actions";

const field = "w-full min-w-0 rounded-lg border border-line bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none";
const label = "block text-xs font-medium text-muted";

/** One message's subject and body, the fields it can use, and how it reads filled in. */
export function MessageForm({ messageKey, subject, body, edited }: { messageKey: string; subject: string; body: string; edited: boolean }) {
  const def = messageDef(messageKey)!;
  const [s, setS] = useState(subject);
  const [b, setB] = useState(body);
  const [saved, save, saving] = useActionState<MessageState, FormData>(saveMessage.bind(null, messageKey), null);
  const [reset, doReset] = useActionState<MessageState>(() => resetMessage(messageKey), null);
  useToast(saved);
  useToast(reset);
  const area = useRef<HTMLTextAreaElement>(null);

  // Put a field where the cursor is in the message.
  function insert(name: string) {
    const el = area.current;
    const at = el ? [el.selectionStart, el.selectionEnd] : [b.length, b.length];
    const next = b.slice(0, at[0]) + `{${name}}` + b.slice(at[1]);
    setB(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at[0] + name.length + 2, at[0] + name.length + 2);
    });
  }

  const problem = templateProblem(def, s, b);
  const preview = fillTemplate({ subject: s, body: b }, sampleWords(def));
  const changed = s !== subject || b !== body;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 [&>*]:min-w-0">
      <section className="rounded-xl border border-line bg-surface p-5">
        <form action={save} className="space-y-4">
          <label className={label}>
            Subject
            <input name="subject" value={s} onChange={(e) => setS(e.target.value)} maxLength={300} className={field + " min-h-12 sm:min-h-0"} />
          </label>
          <label className={label}>
            Message
            <textarea ref={area} name="body" value={b} onChange={(e) => setB(e.target.value)} rows={16} maxLength={10000} className={field + " leading-relaxed"} />
          </label>
          <div>
            <p className={label}>Fields you can use. Tap one to add it to the message.</p>
            <ul className="mt-2 space-y-1.5">
              {def.fields.map((x) => (
                <li key={x.name} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
                  <button
                    type="button"
                    onClick={() => insert(x.name)}
                    className="min-h-12 rounded-md border border-line px-2 font-mono text-xs hover:border-accent hover:text-accent sm:min-h-0 sm:py-1"
                  >
                    {`{${x.name}}`}
                  </button>
                  <span className="min-w-0 text-muted">
                    {x.what}
                    {x.required ? ". Must stay in the message" : ""}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              Leave a blank line between paragraphs. A paragraph whose fields are all empty is left out, so a line like &ldquo;Where: {"{place}"}&rdquo; disappears
              when there is no place.
            </p>
          </div>
          {problem && <p className="text-sm text-risk">{problem}</p>}
          {!problem && saved && !saved.ok && <p className="text-sm text-risk">{saved.message}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button
              disabled={saving || !!problem || !changed}
              className="min-h-12 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60 sm:min-h-0"
            >
              {saving ? "Saving…" : "Save wording"}
            </button>
            {changed && (
              <button
                type="button"
                onClick={() => {
                  setS(subject);
                  setB(body);
                }}
                className="min-h-12 rounded-lg border border-line px-4 py-2 text-sm hover:border-accent hover:text-accent sm:min-h-0"
              >
                Undo my changes
              </button>
            )}
          </div>
        </form>
        {edited && (
          <form action={doReset} className="mt-4 border-t border-line pt-4">
            <ConfirmButton
              ask="Go back to the original wording? Yours is thrown away."
              yes="Yes, use the original"
              className="min-h-12 rounded-lg border border-line px-4 py-2 text-sm hover:border-risk hover:text-risk sm:min-h-0"
            >
              Use the original wording
            </ConfirmButton>
            {reset && !reset.ok && <p className="mt-2 text-sm text-risk">{reset.message}</p>}
          </form>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold">How it reads</h2>
        <p className="mt-1 text-xs text-muted">Filled in with example details as you type. The real ones come from the booking, job or shift.</p>
        <div className="mt-4 rounded-lg border border-line bg-bg p-4">
          <p className="text-xs text-muted">Subject</p>
          <p className="mt-0.5 text-sm font-semibold [overflow-wrap:anywhere]">{preview.subject || " "}</p>
          <div className="mt-4 space-y-3 border-t border-line pt-4 text-sm [overflow-wrap:anywhere]">
            {preview.body.split("\n\n").map((p, i) => (
              <p key={i} className="whitespace-pre-line">
                {p}
              </p>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
