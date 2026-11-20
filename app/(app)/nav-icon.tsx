import type { ReactNode } from "react";

// Small line icons for the side menu, drawn here so the app needs no icon
// package. Each is a 24 by 24 outline that takes the link's text colour.
const ICONS: Record<string, ReactNode> = {
  // Today: a sun
  "/": (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  // Notices: a bell
  "/notices": (
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7 2.5 7h-17S6 15 6 9z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  // Tasks: a ticked box
  "/tasks": (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M8 12.5l3 3 5-6.5" />
    </>
  ),
  // Calendar
  "/calendar": (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  // Ask SNAP: a speech bubble
  "/ask": <path d="M4 5.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-5 4v-4H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z" />,
  // Jobs: a camera
  "/jobs": (
    <>
      <path d="M3 8.5a1.5 1.5 0 0 1 1.5-1.5h3L9 4.5h6l1.5 2.5h3A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  // Queue: an inbox tray
  "/queue": (
    <>
      <path d="M3 13l3-8h12l3 8v5.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />
      <path d="M3 13h5.5l1 2.5h5l1-2.5H21" />
    </>
  ),
  // Support: an envelope
  "/support": (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3.5 7l8.5 6.5L20.5 7" />
    </>
  ),
  // Season: bars on a chart
  "/season": <path d="M4 20V11M10 20V4M16 20v-7M21 20H3" />,
  // Leagues: a shield
  "/leagues": <path d="M12 3l8 3v6c0 4.5-3.3 7.8-8 9-4.7-1.2-8-4.5-8-9V6z" />,
  // Knowledge: an open book
  "/knowledge": (
    <>
      <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5c-3.5-.5-6.5 0-8.5 1.5z" />
      <path d="M12 6.5v13" />
    </>
  ),
  // Staffing: a clipboard
  "/staffing": (
    <>
      <rect x="5" y="4.5" width="14" height="16.5" rx="2" />
      <path d="M9 3h6v3H9zM8.5 11h7M8.5 15h5" />
    </>
  ),
  // My shifts: a clock
  "/shifts": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  // Crew: two people
  "/crew": (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
    </>
  ),
  // Crew pay: a banknote
  // My pay: a wallet
  "/pay": (
    <>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" />
      <rect x="4" y="8" width="17" height="11" rx="2" />
      <circle cx="16.5" cy="13.5" r="1" />
    </>
  ),
  "/crew/pay": (
    <>
      <rect x="3" y="6.5" width="18" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6.5 10v4M17.5 10v4" />
    </>
  ),
  // Gear: a camera bag
  "/gear": (
    <>
      <rect x="3.5" y="8" width="17" height="12" rx="2" />
      <path d="M8.5 8V5.5a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5V8M3.5 13h17" />
    </>
  ),
  // Lab costs: a receipt
  "/lab": (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  // Settings: sliders
  "/settings": (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
};

export function NavIcon({ href }: { href: string }) {
  const shape = ICONS[href];
  if (!shape) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {shape}
    </svg>
  );
}
