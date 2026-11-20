"use client";

import { useState, type ReactNode } from "react";

// A small line icon for each section, keyed by the section's anchor. Drawn
// here like the menu icons, so the app needs no icon package.
const ICONS: Record<string, ReactNode> = {
  // Photo days: a calendar
  days: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  // Readiness: a ticked circle
  readiness: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 12.5l3 3 5-6.5" />
    </>
  ),
  // Schedule: a clock
  schedule: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  // Planning: a clipboard
  planning: (
    <>
      <rect x="5" y="4.5" width="14" height="16" rx="2" />
      <path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h7" />
    </>
  ),
  // Captura: a camera
  captura: (
    <>
      <path d="M3 8.5a1.5 1.5 0 0 1 1.5-1.5h3L9 4.5h6l1.5 2.5h3A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  // Tasks: a ticked box
  tasks: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M8 12.5l3 3 5-6.5" />
    </>
  ),
  // Details: an "i" in a circle
  details: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.5v.5" />
    </>
  ),
  // Portal: a door with an arrow going in
  portal: (
    <>
      <path d="M13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13" />
      <path d="M4 12h10M10.5 8.5L14 12l-3.5 3.5" />
    </>
  ),
  // Parent page: a family, two people
  parents: (
    <>
      <circle cx="8.5" cy="8" r="3" />
      <circle cx="17" cy="10" r="2.2" />
      <path d="M3 19c.6-3.4 2.6-5 5.5-5s4.9 1.6 5.5 5M15 15c2.9-.6 5 .8 5.6 4" />
    </>
  ),
  // Contacts: an address card
  contacts: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M5.5 16c.6-1.7 1.8-2.5 3.5-2.5s2.9.8 3.5 2.5M15 10h3.5M15 13.5h3.5" />
    </>
  ),
};

function Icon({ anchor }: { anchor: string }) {
  const shape = ICONS[anchor];
  if (!shape) return null;
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-accent">
      {shape}
    </svg>
  );
}

/**
 * Links to each section of a long page, pinned to the top as the page
 * scrolls. Nothing scrolls sideways: a wide screen shows every link (they wrap
 * if they must), and a phone shows one "Jump to" button that opens the list.
 */
export function JumpBar({ sections }: { sections: readonly (readonly [anchor: string, label: string])[] }) {
  const [open, setOpen] = useState(false);
  const link = "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm text-muted hover:bg-surface-2 hover:text-text";
  return (
    <nav
      aria-label="Sections of this page"
      className="sticky top-0 z-20 -mx-4 mb-6 border-b border-line bg-bg/95 px-4 py-2 backdrop-blur print:hidden md:-mx-10 md:px-10"
    >
      <div className="hidden flex-wrap gap-1 md:flex">
        {sections.map(([anchor, label]) => (
          <a key={anchor} href={`#${anchor}`} className={link}>
            <Icon anchor={anchor} />
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
              <a key={anchor} href={`#${anchor}`} onClick={() => setOpen(false)} className="flex min-h-12 items-center gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-3 text-base font-medium active:border-accent active:text-accent">
                <Icon anchor={anchor} />
                {label}
              </a>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
