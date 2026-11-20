"use client";

import { useActionState } from "react";
import { useToast } from "@/components/toast";
import { saveInvoiceFolder, testDriveFolder, type DriveState } from "./actions";

export function InvoiceFolder({ platformAddress, folderId }: { platformAddress: string | null; folderId: string | null }) {
  const [saved, save, saving] = useActionState<DriveState, FormData>(saveInvoiceFolder, null);
  useToast(saved);
  const [tested, test, testing] = useActionState<DriveState>(testDriveFolder, null);
  useToast(tested);
  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted">
        The lab&apos;s invoice emails are read from the support mailbox. Each PDF is filed in one Google Drive folder, in a folder per month, and
        the costs show under Lab costs.
      </p>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          In Google Drive, share the invoices folder with this address as <strong>Content manager</strong>:
          <span className="mt-1 block select-all break-all rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-xs">
            {platformAddress ?? "No Workspace key is stored yet, so there is no address to share with."}
          </span>
        </li>
        <li>
          Paste the folder&apos;s link here and save.
          <form action={save} className="mt-2 flex flex-wrap items-center gap-3">
            <input
              name="folder"
              required
              defaultValue={folderId ? `https://drive.google.com/drive/folders/${folderId}` : ""}
              placeholder="https://drive.google.com/drive/folders/…"
              aria-label="Drive folder link"
              className="w-full max-w-xl rounded-lg border border-line bg-surface px-3 py-2"
            />
            <button disabled={saving} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60">
              {saving ? "Saving…" : "Save folder"}
            </button>
            {saved && <p role="status" className={saved.ok ? "text-ok" : "text-risk"}>{saved.message}</p>}
          </form>
        </li>
        <li>
          Test it. This only reads the folder&apos;s name.
          <form action={test} className="mt-2 flex flex-wrap items-center gap-3">
            <button disabled={testing} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:border-accent disabled:opacity-60">
              {testing ? "Testing…" : "Test Drive folder"}
            </button>
            {tested && <p role="status" className={tested.ok ? "text-ok" : "text-risk"}>{tested.message}</p>}
          </form>
        </li>
      </ol>
    </div>
  );
}
