"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { ask } from "./actions";

type Turn = { question: string; answer: string | null; problem: string | null };

const LINK = /\[([^\]\n]{1,120})\]\((\/(?:jobs|leagues)\/[0-9a-f-]{36})\)/g;

/** Plain text, with links to jobs and leagues only. Nothing else is rendered as markup. */
function Answer({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const m of text.matchAll(LINK)) {
    if (m.index > at) parts.push(text.slice(at, m.index));
    parts.push(
      <Link key={m.index} href={m[2]} className="text-accent underline-offset-2 hover:underline">
        {m[1]}
      </Link>,
    );
    at = m.index + m[0].length;
  }
  if (at < text.length) parts.push(text.slice(at));
  return <p className="whitespace-pre-wrap text-sm leading-relaxed">{parts}</p>;
}

export function AskBox({
  examples,
  disabled,
  compact = false,
}: {
  examples: string[];
  disabled: boolean;
  /** The pop-up: the conversation scrolls inside the panel and the page under it is left alone. */
  compact?: boolean;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [turns, pending]);

  function send(question: string) {
    const q = question.trim();
    if (!q || pending || disabled) return;
    const history = turns.filter((t) => t.answer).map((t) => ({ question: t.question, answer: t.answer! }));
    setTurns((t) => [...t, { question: q, answer: null, problem: null }]);
    setText("");
    start(async () => {
      let result: Awaited<ReturnType<typeof ask>>;
      try {
        result = await ask(q, history);
      } catch {
        result = { ok: false, message: "Ask SNAP did not answer in time. Try again." };
      }
      setTurns((t) =>
        t.map((turn, i) =>
          i === t.length - 1
            ? { ...turn, answer: result.ok ? result.answer : null, problem: result.ok ? null : result.message }
            : turn,
        ),
      );
      if (!compact) router.refresh(); // the day's total and the recent questions list
    });
  }

  return (
    <div className={compact ? "flex min-h-0 flex-1 flex-col gap-3" : "flex flex-col gap-4"}>
      {turns.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {examples.map((e) => (
            <button
              key={e}
              type="button"
              disabled={disabled}
              onClick={() => send(e)}
              className="rounded-full border border-line px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      <div className={compact ? "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1" : "flex flex-col gap-4"} aria-live="polite">
        {turns.map((t, i) => (
          <div key={i} className="flex flex-col gap-2">
            <p className="self-end rounded-2xl bg-accent/15 px-4 py-2 text-sm">{t.question}</p>
            <div className="rounded-2xl border border-line bg-surface px-4 py-3">
              {t.answer && <Answer text={t.answer} />}
              {t.problem && <p className="text-sm text-risk" role="alert">{t.problem}</p>}
              {!t.answer && !t.problem && <p className="text-sm text-muted">Looking that up…</p>}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
          Your question
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
            rows={2}
            maxLength={2000}
            disabled={disabled}
            placeholder={compact ? "Ask about jobs, leagues, tasks or the queue" : "Which photo days in the next two weeks are missing a roster?"}
            className="resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text disabled:opacity-60"
          />
        </label>
        <button
          disabled={pending || disabled || !text.trim()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Asking…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
