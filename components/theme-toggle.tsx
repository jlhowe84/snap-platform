"use client";

import { THEME_COOKIE } from "@/lib/theme";

/** Switches between light and dark mode and remembers the choice for a year. */
export function ThemeToggle({ className }: { className?: string }) {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }
  return (
    <button type="button" onClick={toggle} className={className}>
      <span className="when-dark">Light mode</span>
      <span className="when-light">Dark mode</span>
    </button>
  );
}
