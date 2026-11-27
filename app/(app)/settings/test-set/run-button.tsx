"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { runBatch, startRun } from "./actions";

/** Starts a run and keeps asking for the next few cases until it is done. */
export function RunButton({ cases }: { cases: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function run() {
    setBusy(true);
    setFailed(false);
    setLine("Starting…");
    const started = await startRun();
    if (!started.ok) {
      setFailed(true);
      setLine(started.message);
      setBusy(false);
      return;
    }
    for (;;) {
      const r = await runBatch(started.runId);
      if (!r.ok) {
        setFailed(true);
        setLine(r.message);
        break;
      }
      setLine(`${r.finished} of ${r.total} cases run…`);
      if (r.done) {
        setLine(`Done: ${r.finished} of ${r.total} cases run.`);
        break;
      }
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={run}
        disabled={busy || cases === 0}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60"
      >
        {busy ? "Running…" : `Run the test set (${cases})`}
      </button>
      {line && <p role="status" className={failed ? "text-sm text-risk" : "text-sm text-muted"}>{line}</p>}
    </div>
  );
}
