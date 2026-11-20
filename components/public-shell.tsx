import Link from "next/link";

/** The frame for pages parents open: light, no sign-in, the company's name up top. */
export function PublicShell({
  companyName,
  companySlug,
  kicker,
  children,
}: {
  companyName: string | null;
  companySlug: string | null;
  kicker: string;
  children: React.ReactNode;
}) {
  return (
    <div className="outward min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4">
          <div className="leading-tight">
            <p className="font-display text-xl font-bold uppercase tracking-wide">{companyName ?? "Photo Day"}</p>
            <p className="text-xs uppercase tracking-[0.18em] text-accent">{kicker}</p>
          </div>
          {companySlug && kicker !== "Help center" && (
            <Link href={`/help/${companySlug}`} className="text-sm text-accent underline-offset-2 hover:underline">
              Help center
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>
    </div>
  );
}
