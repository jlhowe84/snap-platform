"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function GoogleButton({ next }: { next: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, queryParams: { prompt: "select_account" } },
    });
    if (error) {
      setError("Google sign-in is not switched on yet.");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={signIn}
        disabled={busy}
        className="flex w-full items-center justify-center gap-3 rounded-lg bg-accent px-4 py-3 font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-60"
      >
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && <p className="mt-3 text-sm text-risk">{error}</p>}
    </>
  );
}
