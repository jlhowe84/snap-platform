import Link from "next/link";
import type { ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function PageHeader({
  eyebrow,
  title,
  back,
  children,
}: {
  eyebrow?: string;
  title: string;
  /** Where a detail page came from: shown as a link above the title. */
  back?: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-2 inline-flex min-h-8 items-center text-sm text-muted hover:text-accent">
            ← {back.label}
          </Link>
        )}
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
        )}
        <h1 className="font-display text-3xl font-semibold uppercase tracking-wide [overflow-wrap:anywhere] md:text-4xl">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function Card({
  title,
  action,
  children,
  className,
  id,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Lets a jump bar link to this card; it stops clear of a sticky bar. */
  id?: string;
}) {
  return (
    <section id={id} className={cx("scroll-mt-20 rounded-xl border border-line bg-surface p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && (
            <h2 className="font-display text-lg font-semibold uppercase tracking-wider text-muted">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 font-display text-5xl font-semibold leading-none">{value}</p>
      {hint && <p className="mt-2 text-sm text-muted">{hint}</p>}
    </div>
  );
}

const TONES = {
  ok: "bg-ok",
  warn: "bg-warn",
  risk: "bg-risk",
  info: "bg-info",
  accent: "bg-accent",
  muted: "bg-muted",
} as const;
export type Tone = keyof typeof TONES;

export function StatusDot({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className={cx("h-2 w-2 rounded-full", TONES[tone])} aria-hidden />
      {label}
    </span>
  );
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: Tone }) {
  const ring = {
    ok: "text-ok border-ok/40",
    warn: "text-warn border-warn/40",
    risk: "text-risk border-risk/40",
    info: "text-info border-info/40",
    accent: "text-accent border-accent/50",
    muted: "text-muted border-line",
  }[tone];
  return (
    <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs", ring)}>
      {children}
    </span>
  );
}

/** Ordered steps, filled up to the current one. Used for production stage. */
export function ReadinessStrip({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex gap-1" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s} className="flex-1" title={s}>
          <span
            className={cx(
              "block h-1.5 rounded-full",
              i < current ? "bg-accent" : i === current ? "bg-accent/60" : "bg-surface-2",
            )}
          />
          <span className="sr-only">
            {s}
            {i === current ? " (current)" : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "ghost";
}) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
        variant === "primary"
          ? "bg-accent text-accent-ink hover:brightness-110"
          : "border border-line text-text hover:bg-surface-2",
      )}
    >
      {children}
    </Link>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line p-6 text-sm text-muted">{children}</p>;
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}
