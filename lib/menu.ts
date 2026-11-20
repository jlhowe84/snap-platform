export type MenuItem = { href: string; label: string; badge?: number };
export type MenuGroup = { label: string; items: MenuItem[] };

/**
 * The menu entry the current page belongs to: the longest entry address the
 * path sits under, so /crew/pay lights Crew pay and not Crew.
 */
export function activeHref(path: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const h of hrefs) {
    const match = h === "/" ? path === "/" : path === h || path.startsWith(`${h}/`);
    if (match && (!best || h.length > best.length)) best = h;
  }
  return best;
}
