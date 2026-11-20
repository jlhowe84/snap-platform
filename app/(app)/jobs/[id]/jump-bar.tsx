"use client";

import { useState } from "react";

/**
 * Links to each section of a long page, pinned to the top as the page
 * scrolls. Nothing scrolls sideways: a wide screen shows every link (they wrap
 * if they must), and a phone shows one "Jump to" button that opens the list.
 */
export function JumpBar({ sections }: { sections: readonly (readonly [anchor: string, label: string])[] }) {
  const [open, setOpen] = useState(false);
  const link = "rounded-lg px-2.5 py-1 text-sm text-muted hover:bg-surface-2 hover:text-text";
  return (
    <nav
      aria-label="Sections of this page"
      className="sticky top-0 z-20 -mx-4 mb-6 border-b border-line bg-bg/95 px-4 py-2 backdrop-blur print:hidden md:-mx-10 md:px-10"
    >
      <div className="hidden flex-wrap gap-1 md:flex">
        {sections.map(([anchor, label]) => (
          <a key={anchor} href={`#${anchor}`} className={link}>
            {label}
          </a>
        ))}
      </div>
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="jump-list"
          className="flex w-full items-center justify-between rounded-lg border border-line bg-surface px-3.5 py-3 text-base font-medium"
        >
          Jump to a section
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={open ? "rotate-180" : ""}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {open && (
          <div id="jump-list" className="mt-2 grid grid-cols-2 gap-2">
            {sections.map(([anchor, label]) => (
              <a key={anchor} href={`#${anchor}`} onClick={() => setOpen(false)} className="flex min-h-12 items-center rounded-lg border border-line bg-surface px-3.5 py-3 text-base font-medium active:border-accent active:text-accent">
                {label}
              </a>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
