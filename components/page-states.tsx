"use client";

import { useEffect } from "react";

/** Shown while a page's data is on its way, so a slow page does not look frozen. */
export function PageLoading() {
  return (
    <div role="status" aria-live="polite" className="animate-pulse">
      <span className="sr-only">Loading</span>
      <div className="mb-2 h-3 w-24 rounded bg-surface-2" />
      <div className="mb-8 h-9 w-64 max-w-full rounded bg-surface-2" />
      <div className="space-y-4">
        <div className="h-28 rounded-xl border border-line bg-surface" />
        <div className="h-44 rounded-xl border border-line bg-surface" />
        <div className="h-28 rounded-xl border border-line bg-surface" />
      </div>
    </div>
  );
}

/** Shown when a page could not be drawn: says so plainly and offers another try. */
export function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-xl border border-risk/40 bg-surface p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-risk">Something went wrong</p>
      <h1 className="mt-2 font-display text-3xl font-semibold uppercase tracking-wide">This page did not load</h1>
      <p className="mt-2 text-sm text-muted">
        Nothing you entered was lost on our side unless you were in the middle of saving. Try again, and if it keeps happening tell the office which page it was.
      </p>
      <button
        onClick={() => retry()}
        className="mt-5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink hover:brightness-110"
      >
        Try again
      </button>
    </div>
  );
}
