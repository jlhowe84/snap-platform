"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NavIcon } from "./nav-icon";
import { activeHref, type MenuGroup, type MenuItem } from "@/lib/menu";

function Badge({ n, active }: { n?: number; active: boolean }) {
  if (!n) return null;
  return (
    <span
      className={
        "ml-auto rounded-full px-1.5 text-xs font-semibold " + (active ? "bg-accent-ink/20" : "bg-accent text-accent-ink")
      }
    >
      {n}
    </span>
  );
}

function Row({ item, active, onNavigate }: { item: MenuItem; active: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={
        "flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors " +
        (active ? "bg-accent text-accent-ink" : "text-muted hover:bg-surface-2 hover:text-text")
      }
    >
      <NavIcon href={item.href} />
      {item.label}
      <Badge n={item.badge} active={active} />
    </Link>
  );
}

function Groups({ groups, active, onNavigate }: { groups: MenuGroup[]; active: string | null; onNavigate?: () => void }) {
  return (
    <>
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-1 px-3 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted/70">{g.label}</p>
          <div className="flex flex-col gap-0.5">
            {g.items.map((i) => (
              <Row key={i.href} item={i} active={active === i.href} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/** The side menu on a wide screen: every page, under a few headings. */
export function SideMenu({ groups }: { groups: MenuGroup[] }) {
  const path = usePathname();
  const active = activeHref(path, groups.flatMap((g) => g.items.map((i) => i.href)));
  return (
    <nav aria-label="Main menu" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <Groups groups={groups} active={active} />
    </nav>
  );
}

/**
 * The menu on a phone: a bar along the bottom with the few pages used most
 * and a More button that opens the whole menu, the person's name and Sign out.
 */
export function PhoneBar({
  groups,
  quick,
  name,
  roles,
}: {
  groups: MenuGroup[];
  quick: MenuItem[];
  name: string;
  roles: string;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = activeHref(path, groups.flatMap((g) => g.items.map((i) => i.href)));
  const inQuick = quick.some((q) => q.href === active);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const tab = (on: boolean) =>
    "flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[0.7rem] font-medium " + (on ? "text-accent" : "text-muted");

  return (
    <div className="print:hidden md:hidden">
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <button type="button" aria-label="Close the menu" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/60" />
          <div
            id="phone-menu"
            role="dialog"
            aria-label="Menu"
            className="relative max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{name}</p>
                <p className="text-xs text-muted">{roles}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-line px-3 py-1.5 text-sm">
                Close
              </button>
            </div>
            <nav aria-label="Main menu" className="grid grid-cols-2 gap-x-2 gap-y-4">
              <Groups groups={groups} active={active} onNavigate={() => setOpen(false)} />
            </nav>
            <form action="/auth/signout" method="post" className="mt-5 border-t border-line pt-4">
              <button className="w-full rounded-lg border border-line px-3 py-2 text-sm text-muted hover:text-text">Sign out</button>
            </form>
          </div>
        </div>
      )}
      <nav
        aria-label="Quick menu"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        {quick.map((q) => (
          <Link key={q.href} href={q.href} aria-current={active === q.href ? "page" : undefined} className={tab(active === q.href)}>
            <span className="relative">
              <NavIcon href={q.href} />
              {!!q.badge && <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-accent" aria-hidden />}
            </span>
            <span className="max-w-full truncate">{q.label}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="phone-menu"
          className={tab(!inQuick && !!active)}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}
