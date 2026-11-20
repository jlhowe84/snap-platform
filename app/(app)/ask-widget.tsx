"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AskBox } from "./ask/ask-box";

const EXAMPLES = ["What photo days are coming up in the next two weeks?", "What is on my task list this week?", "What is waiting in the queue?"];

// Ask SNAP as a pop-up in the corner of every staff page. It lives in the app
// layout, so the conversation stays as the person moves between pages; it is
// the same read-only assistant as /ask, with the same roles, cap and log.
export function AskWidget() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [chat, setChat] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (path === "/ask") return null; // the full page is already there

  return (
    <>
      <section
        id="ask-snap-panel"
        aria-label="Ask SNAP"
        hidden={!open}
        className="fixed inset-x-2 bottom-36 z-40 flex h-[min(34rem,calc(100dvh-10.5rem))] md:bottom-20 md:h-[min(34rem,calc(100dvh-6.5rem))] flex-col rounded-2xl border border-line bg-surface p-4 shadow-2xl sm:inset-x-auto sm:right-5 sm:w-[24rem]"
      >
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">Ask SNAP</p>
            <p className="text-xs text-muted">Reads what you can already open. It cannot send or change anything.</p>
          </div>
          <div className="flex shrink-0 gap-3 text-xs">
            <button type="button" onClick={() => setChat((n) => n + 1)} className="text-muted hover:text-accent">
              Clear
            </button>
            <Link href="/ask" onClick={() => setOpen(false)} className="text-muted hover:text-accent">
              Full page
            </Link>
          </div>
        </header>
        <AskBox key={chat} examples={EXAMPLES} disabled={false} compact />
      </section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="ask-snap-panel"
        aria-label={open ? "Close Ask SNAP" : "Open Ask SNAP"}
        className="fixed bottom-20 right-4 z-40 flex h-12 w-12 md:bottom-5 md:right-5 md:h-14 md:w-14 items-center justify-center rounded-full bg-accent text-accent-ink shadow-lg hover:brightness-110"
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 3C6.9 3 3 6.6 3 11c0 2.3 1.1 4.400 2.900 5.800L5 21l4.300-2.300c.9.200 1.800.300 2.700.300 5.100 0 9-3.600 9-8s-3.900-8-9-8z" />
          </svg>
        )}
      </button>
    </>
  );
}
