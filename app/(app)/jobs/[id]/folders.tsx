"use client";

import { useActionState } from "react";
import { useToast } from "@/components/toast";
import { setFolderName, type FolderState } from "./folders-actions";

/** For a folder made by hand under another name, so the helper counts the right one. */
export function FolderNameForm({ jobId, current }: { jobId: string; current: string | null }) {
  const [state, action, pending] = useActionState<FolderState, FormData>(setFolderName.bind(null, jobId), null);
  useToast(state);
  return (
    <details>
      <summary className="min-h-12 cursor-pointer text-xs text-muted hover:text-accent sm:min-h-0">Folder has another name</summary>
      <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
        <input
          name="nas_folder"
          defaultValue={current ?? ""}
          maxLength={200}
          placeholder="26 Delco Phantoms"
          aria-label="Folder name"
          className="min-h-12 rounded-lg border border-line bg-bg px-3 py-2 text-base text-text focus:border-accent focus:outline-none sm:min-h-0 sm:text-sm"
        />
        <button disabled={pending} className="min-h-12 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:border-accent disabled:opacity-60 sm:min-h-0">
          Save
        </button>
        {state && !state.ok && <p className="w-full text-sm text-risk">{state.message}</p>}
      </form>
    </details>
  );
}
