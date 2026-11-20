"use client";

import { THEME_COOKIE } from "@/lib/theme";

const sun = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
  </svg>
);

const moon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </svg>
);

/**
 * Switches between light and dark mode and remembers the choice for a year.
 * Shows a sun in dark mode (tap for light) and a moon in light mode (tap for dark).
 */
export function ThemeToggle({ className }: { className?: string }) {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }
  return (
    <button type="button" onClick={toggle} className={className} title="Switch light or dark mode">
      <span className="when-dark inline-flex">
        {sun}
        <span className="sr-only">Switch to light mode</span>
      </span>
      <span className="when-light inline-flex">
        {moon}
        <span className="sr-only">Switch to dark mode</span>
      </span>
    </button>
  );
}
