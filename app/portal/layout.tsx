import Link from "next/link";
import { requirePortalViewer } from "@/lib/auth";

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const viewer = await requirePortalViewer();
  return (
    <div className="outward min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/portal" className="leading-tight">
            <p className="font-display text-xl font-bold uppercase tracking-wide">{viewer.companyName ?? "Photo Day"}</p>
            <p className="text-xs uppercase tracking-[0.18em] text-accent">Photo day portal</p>
          </Link>
          <div className="text-right text-xs text-muted">
            <p className="text-text">{viewer.name}</p>
            {viewer.staff ? (
              <Link href="/" className="underline-offset-2 hover:underline">
                Back to the office app
              </Link>
            ) : (
              <form action="/auth/signout" method="post">
                <button className="underline-offset-2 hover:text-text hover:underline">Sign out</button>
              </form>
            )}
          </div>
        </div>
      </header>
      {viewer.staff && (
        <p className="bg-surface-2 px-4 py-2 text-center text-xs text-muted">
          You are seeing the portal as staff. Only the league&apos;s coordinator can sign. Changes the office makes here are saved as the office&apos;s.
        </p>
      )}
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}
