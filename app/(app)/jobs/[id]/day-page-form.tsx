"use client";

import { useActionState } from "react";
import { useToast } from "@/components/toast";
import { saveDayPage, type DayPageState } from "./day-page-actions";

const field = "mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm";
const label = "block text-xs font-semibold uppercase tracking-[0.14em] text-muted";

export type DayPageFields = {
  published: boolean;
  show_team_times: boolean;
  what_to_wear: string | null;
  what_to_bring: string | null;
  note: string | null;
};

export function DayPageForm({ jobId, page }: { jobId: string; page: DayPageFields | null }) {
  const [state, action, pending] = useActionState<DayPageState, FormData>(saveDayPage.bind(null, jobId), null);
  useToast(state);
  return (
    <form action={action} className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="published" defaultChecked={page?.published ?? false} />
        Page is live (anyone with the link can open it)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="show_team_times" defaultChecked={page?.show_team_times ?? true} />
        Show team times once the league submits the schedule
      </label>
      <label className={label}>
        What to wear
        <textarea name="what_to_wear" rows={2} maxLength={2000} defaultValue={page?.what_to_wear ?? ""} className={field} />
      </label>
      <label className={label}>
        What to bring
        <textarea name="what_to_bring" rows={2} maxLength={2000} defaultValue={page?.what_to_bring ?? ""} className={field} />
      </label>
      <label className={label}>
        Note for parents
        <textarea name="note" rows={2} maxLength={2000} defaultValue={page?.note ?? ""} className={field} />
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60">
          {pending ? "Saving…" : page ? "Save page" : "Make the page"}
        </button>
        {state && <p role="status" className={state.ok ? "text-sm text-muted" : "text-sm text-risk"}>{state.message}</p>}
      </div>
    </form>
  );
}
