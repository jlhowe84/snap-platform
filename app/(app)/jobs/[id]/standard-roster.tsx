"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { finishStandardRoster, startStandardRoster, type StandardResult } from "./roster-actions";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function StandardRosterUpload({ jobId, hasOne }: { jobId: string; hasOne: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<StandardResult | null>(null);

  async function send(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const start = await startStandardRoster(jobId, { name: file.name, size: file.size });
      if (!start.ok) {
        setResult(start);
        return;
      }
      const { error } = await createClient()
        .storage.from("rosters")
        .uploadToSignedUrl(start.path, start.token, file, { contentType: "text/csv" });
      if (error) {
        setResult({ ok: false, message: "The upload was interrupted. Try again." });
        return;
      }
      setResult(await finishStandardRoster(jobId, start.path));
      router.refresh();
    } catch {
      setResult({ ok: false, message: "The upload was interrupted. Try again." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept=".csv"
        className="sr-only"
        id="standard-roster"
        onChange={(e) => void send(e.target.files?.[0])}
      />
      <label
        htmlFor="standard-roster"
        className={`inline-block cursor-pointer rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:border-accent hover:text-accent ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        {busy ? "Checking…" : hasOne ? "Upload a newer finished roster" : "Upload the finished roster"}
      </label>
      <div aria-live="polite">
        {result?.ok && (
          <p className="mt-2 text-sm text-ok">
            Imported {plural(result.teams, "team")} and {plural(result.players, "player")}
            {result.added + result.updated > 0 && ` (${result.added} new, ${result.updated} updated`}
            {result.added + result.updated > 0 && (result.removed ? `, ${result.removed} removed)` : ")")}.
            {result.unassigned > 0 && ` ${plural(result.unassigned, "player")} still need a team.`}
            {result.kept > 0 &&
              ` ${plural(result.kept, "team")} from the earlier roster ${result.kept === 1 ? "is" : "are"} not in this file but already on the schedule, so ${result.kept === 1 ? "it was" : "they were"} left in place.`}
          </p>
        )}
        {result && !result.ok && (
          <div className="mt-2 text-sm text-risk">
            <p>{result.message}</p>
            {result.problems && (
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {result.problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
