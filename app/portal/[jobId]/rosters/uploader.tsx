"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ROSTER_ACCEPT, ROSTER_MAX_BYTES, rosterMime } from "@/lib/rosters/types";
import { finishRosterUpload, startRosterUpload } from "./actions";

type Row = { name: string; state: "sending" | "done" | "failed"; message?: string };

export function RosterUploader({ jobId }: { jobId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  async function send(files: File[]) {
    if (!files.length || busy) return;
    setBusy(true);
    setRows(files.map((f) => ({ name: f.name, state: "sending" })));
    const mark = (i: number, row: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...row } : x)));
    const supabase = createClient();

    for (const [i, file] of files.entries()) {
      if (file.size > ROSTER_MAX_BYTES) {
        mark(i, { state: "failed", message: "Over 25 MB." });
        continue;
      }
      if (!rosterMime(file.name)) {
        mark(i, { state: "failed", message: "Not a CSV, Excel, PDF, JPG or PNG file." });
        continue;
      }
      try {
        const start = await startRosterUpload(jobId, { name: file.name, size: file.size });
        if (!start.ok) {
          mark(i, { state: "failed", message: start.message });
          continue;
        }
        const { error } = await supabase.storage
          .from("rosters")
          .uploadToSignedUrl(start.path, start.token, file, { contentType: start.mime });
        if (error) {
          mark(i, { state: "failed", message: "The upload was interrupted. Try again." });
          continue;
        }
        const done = await finishRosterUpload(jobId, start.path, file.name);
        mark(i, done.ok ? { state: "done", message: done.message } : { state: "failed", message: done.message });
      } catch {
        mark(i, { state: "failed", message: "The upload was interrupted. Try again." });
      }
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void send(Array.from(e.dataTransfer.files));
        }}
        className={`rounded-xl border-2 border-dashed p-8 text-center ${over ? "border-accent bg-surface-2" : "border-line"}`}
      >
        <p className="font-medium">Drop roster files here</p>
        <p className="mt-1 text-xs text-muted">CSV, Excel, PDF, JPG or PNG · up to 25 MB each · several files are fine</p>
        <input
          ref={input}
          type="file"
          multiple
          accept={ROSTER_ACCEPT}
          className="sr-only"
          id="roster-files"
          onChange={(e) => void send(Array.from(e.target.files ?? []))}
        />
        <label
          htmlFor="roster-files"
          className={`mt-4 inline-block cursor-pointer rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 ${busy ? "pointer-events-none opacity-60" : ""}`}
        >
          {busy ? "Uploading…" : "Choose files"}
        </label>
      </div>
      {rows.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm" aria-live="polite">
          {rows.map((r, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="truncate">{r.name}</span>
              <span className={r.state === "failed" ? "text-risk" : r.state === "done" ? "text-ok" : "text-muted"}>
                {r.state === "sending" ? "Uploading…" : r.state === "done" ? (r.message ?? "Received") : r.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
