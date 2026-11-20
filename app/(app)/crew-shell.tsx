"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "./nav-icon";
import { activeHref, type MenuItem } from "@/lib/menu";

/**
 * The layout for crew: bright, built for a phone, and only the few pages crew
 * use. The pages sit in a bar along the bottom on a phone and across the top
 * on a wide screen. Nothing scrolls sideways.
 */
export function CrewShell({
  companyName,
  name,
  items,
  children,
}: {
  companyName: string;
  name: string;
  items: MenuItem[];
  children: React.ReactNode;
}) {
  const path = usePathname();
  const active = activeHref(path, items.map((i) => i.href));
  const dot = (i: MenuItem) => !!i.badge && <span className="absolute -right-2 -top-1 h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />;

  return (
    <div className="outward min-h-screen">
      <header className="border-b border-line bg-surface print:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0 leading-tight">
            <p className="font-display text-xl font-bold uppercase tracking-wide">{companyName}</p>
            <p className="truncate text-xs text-muted">{name}</p>
          </div>
          <form action="/auth/signout" method="post">
            <button className="rounded-lg border border-line px-3 py-2 text-sm text-muted hover:text-text">Sign out</button>
          </form>
        </div>
        <nav aria-label="Main menu" className="mx-auto hidden max-w-3xl gap-1 px-4 pb-2 md:flex">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={active === i.href ? "page" : undefined}
              className={
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium " +
                (active === i.href ? "bg-accent text-accent-ink" : "text-muted hover:bg-surface-2 hover:text-text")
              }
            >
              <span className="relative">
                <NavIcon href={i.href} />
                {dot(i)}
              </span>
              {i.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-6 print:pb-6 md:pb-10">{children}</main>
      <nav
        aria-label="Main menu"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] print:hidden md:hidden"
      >
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active === i.href ? "page" : undefined}
            className={
              "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-xs font-medium " +
              (active === i.href ? "text-accent" : "text-muted")
            }
          >
            <span className="relative">
              <NavIcon href={i.href} />
              {dot(i)}
            </span>
            <span className="max-w-full truncate">{i.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
