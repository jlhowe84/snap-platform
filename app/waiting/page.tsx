import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer, hasAnyRole, STAFF_ROLES } from "@/lib/auth";

export const metadata: Metadata = { title: "Waiting for access" };

export default async function WaitingPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.companyId && hasAnyRole(viewer, STAFF_ROLES)) redirect("/");

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Signed in</p>
        <h1 className="mt-2 font-display text-4xl font-semibold uppercase">Waiting for access</h1>
        <p className="mt-3 text-sm text-muted">
          You are signed in as <span className="text-text">{viewer.email}</span>, but this account
          has not been given a role yet. Ask an owner or admin to invite this email address. Once
          they do, refresh this page.
        </p>
        <form action="/auth/signout" method="post" className="mt-6">
          <button className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-surface-2">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
