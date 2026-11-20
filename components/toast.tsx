"use client";

import { useEffect, useState } from "react";

type Result = { ok: boolean; message?: string } | null | undefined;
type Toast = { id: number; ok: boolean; text: string };

const EVENT = "app:toast";

/**
 * Tells the person what a form just did. Give it the state a form action
 * returned: each new result shows for a few seconds at the bottom of the
 * screen, so it is seen even when the form itself has scrolled away.
 */
export function useToast(state: Result) {
  useEffect(() => {
    if (state?.message) toast(state.ok, state.message);
  }, [state]);
}

/** Shows one message now, for work done outside a form. */
export function toast(ok: boolean, text: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { ok, text } }));
}

/** Shows the messages. One of these sits in the root layout. */
export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let next = 1;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const drop = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));
    const onToast = (e: Event) => {
      const { ok, text } = (e as CustomEvent<{ ok: boolean; text: string }>).detail;
      const id = next++;
      setToasts((t) => [...t.slice(-2), { id, ok, text }]);
      // A problem stays up longer than a plain "Saved".
      timers.add(setTimeout(() => drop(id), ok ? 4000 : 8000));
    };
    window.addEventListener(EVENT, onToast);
    return () => {
      window.removeEventListener(EVENT, onToast);
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 print:hidden md:bottom-6"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          role={t.ok ? "status" : "alert"}
          onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
          className={
            "pointer-events-auto flex max-w-md items-start gap-2 rounded-xl border px-4 py-3 text-left text-sm font-medium shadow-lg [overflow-wrap:anywhere] " +
            (t.ok ? "border-ok/40 bg-surface-2 text-text" : "border-risk/50 bg-surface-2 text-text")
          }
        >
          <span aria-hidden className={"mt-0.5 font-bold " + (t.ok ? "text-ok" : "text-risk")}>{t.ok ? "✓" : "!"}</span>
          <span className="line-clamp-4">{t.text}</span>
        </button>
      ))}
    </div>
  );
}
