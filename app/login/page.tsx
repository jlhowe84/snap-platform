import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { GoogleButton } from "./google-button";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const failed = params.error === "signin";

  if (await getViewer()) redirect(next);

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Photo Day Platform</p>
        <h1 className="mt-2 font-display text-4xl font-semibold uppercase">Sign in</h1>
        <p className="mt-2 text-sm text-muted">Use your work Google account.</p>
        {failed && (
          <p className="mt-4 rounded-lg border border-risk/40 p-3 text-sm text-risk">
            That sign-in did not go through. Please try again.
          </p>
        )}
        <div className="mt-6">
          <GoogleButton next={next} />
        </div>
      </div>
    </main>
  );
}
