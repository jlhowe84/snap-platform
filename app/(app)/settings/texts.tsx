"use client";

import { useActionState } from "react";
import { useToast } from "@/components/toast";
import { saveTextTestNumber, type TextNumberState } from "./actions";

export type TextsStatus = {
  enabled: boolean;
  testMode: boolean;
  testNumber: string;
  keysSet: boolean;
  webhookUrl: string;
  counts: { logged: number; sent: number; skipped: number; failed: number };
};

const row = "flex items-center justify-between gap-3 py-2";

export function CrewTexts({ status }: { status: TextsStatus }) {
  const [saved, save, saving] = useActionState<TextNumberState, FormData>(saveTextTestNumber, null);
  useToast(saved);
  const c = status.counts;
  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted">
        Shift texts go only to crew who said yes on their shifts page. Each text is logged first; it is sent only when texts are switched on and the
        carrier keys are set. In test mode every text goes to the test number instead.
      </p>
      <dl className="divide-y divide-line">
        <div className={row}>
          <dt>Sending</dt>
          <dd>{status.enabled ? "On" : "Off (texts are logged, not sent)"}</dd>
        </div>
        <div className={row}>
          <dt>Carrier keys (Twilio)</dt>
          <dd>{status.keysSet ? "Set" : "Not set in Vercel"}</dd>
        </div>
        <div className={row}>
          <dt>Mode</dt>
          <dd>{status.testMode ? `Test: to ${status.testNumber || "no number yet"}` : "Live: to each crew member"}</dd>
        </div>
        <div className={row}>
          <dt>Last 30 days</dt>
          <dd>
            {c.logged} waiting, {c.sent} sent, {c.skipped} skipped, {c.failed} failed
          </dd>
        </div>
      </dl>
      <form action={save} className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Test number</span>
          <input
            name="number"
            type="tel"
            defaultValue={status.testNumber}
            placeholder="(215) 555-0142"
            className="min-h-12 w-full max-w-xs rounded-lg border border-line bg-surface px-3 py-2 text-base md:min-h-0 md:text-sm"
          />
        </label>
        <button disabled={saving} className="min-h-12 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60 md:min-h-0">
          {saving ? "Saving…" : "Save test number"}
        </button>
      </form>
      {saved && <p role="status" className={saved.ok ? "text-ok" : "text-risk"}>{saved.message}</p>}
      <p className="text-muted">
        For STOP and START replies, set the Messaging Service&apos;s incoming message address in Twilio to:
        <span className="mt-1 block select-all break-all rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-xs">{status.webhookUrl}</span>
      </p>
    </div>
  );
}
