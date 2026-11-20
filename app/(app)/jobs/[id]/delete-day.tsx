"use client";

import { useState, useTransition } from "react";
import { toast } from "@/components/toast";
import { deletePhotoDay } from "./add-day-actions";

const btn = "min-h-12 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60 sm:min-h-0";

/** Delete with a second step, so one stray tap removes nothing. */
export function DeleteDay({ jobId, photoDayId, date }: { jobId: string; photoDayId: string; date: string }) {
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="mt-2 flex min-h-12 items-center text-sm text-risk hover:underline sm:min-h-0">
        Delete photo day
      </button>
    );
  }
  return (
    <div className="mt-2 rounded-lg border border-risk/50 p-3">
      <p className="text-sm">Delete the photo day on {date}? This cannot be undone.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await deletePhotoDay(jobId, photoDayId);
              if (result) toast(result.ok, result.message);
              if (!result?.ok) setAsking(false);
            })
          }
          className={`${btn} bg-risk text-white hover:brightness-110`}
        >
          {pending ? "Deleting…" : "Yes, delete it"}
        </button>
        <button type="button" disabled={pending} onClick={() => setAsking(false)} className={`${btn} border border-line`}>
          Keep it
        </button>
      </div>
    </div>
  );
}
