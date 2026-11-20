"use client";

import { useActionState, useState } from "react";
import { toast, useToast } from "@/components/toast";
import { createPortalLink, type PortalLinkState } from "./portal-actions";

export function PortalLinkForm({ jobId, contacts }: { jobId: string; contacts: { id: string; name: string; email: string }[] }) {
  const [state, action, pending] = useActionState<PortalLinkState, FormData>(createPortalLink.bind(null, jobId), null);
  useToast(state);
  if (!contacts.length) {
    return <p className="text-sm text-muted">Add a contact with an email to this job to make a portal link.</p>;
  }
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select
          name="contact_id"
          required
          className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
        >
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.email})
            </option>
          ))}
        </select>
        <button
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Making…" : "Make portal link"}
        </button>
      </div>
      {state?.ok === false && <p className="text-sm text-risk">{state.message}</p>}
      {state?.ok && <LinkBox url={state.url} contact={state.contact} />}
    </form>
  );
}

/** A freshly made link, with a button to copy it. Shown once. */
function LinkBox({ url, contact }: { url: string; contact: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="w-full space-y-2 rounded-lg border border-accent/50 p-3 text-sm">
      <p>Link for {contact}. Copy it now: it is shown only once. Nothing was emailed.</p>
      <div className="flex gap-2">
        <input readOnly value={url} className="min-w-0 flex-1 rounded border border-line bg-bg px-2 py-2 font-mono text-xs" />
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true))}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-xs text-muted">
        Opening it signs the browser in as that contact. Test it in a private window so you stay signed in here.
      </p>
    </div>
  );
}

/**
 * For a contact who already has a link: one press puts a working link on the
 * clipboard. A link is kept only in scrambled form once made, so this makes a
 * fresh one each time. Earlier links keep working.
 */
export function FreshLink({ jobId, contactId }: { jobId: string; contactId: string }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // Shown only if the browser would not let the link be copied for the person.
  const [made, setMade] = useState<{ url: string; contact: string } | null>(null);

  async function copy() {
    setBusy(true);
    setMade(null);
    const form = new FormData();
    form.set("contact_id", contactId);
    const result = createPortalLink(jobId, null, form);
    const url = result.then((r) => {
      if (!r?.ok) throw new Error(r?.message ?? "The link could not be made.");
      return r.url;
    });
    try {
      // Handing the clipboard a promise keeps the press counted as the
      // person's own, which an iPhone needs when the link takes a moment.
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": url.then((u) => new Blob([u], { type: "text/plain" })) })]);
      } else {
        await navigator.clipboard.writeText(await url);
      }
      setCopied(true);
      toast(true, "Portal link copied. Paste it wherever you need it.");
      setTimeout(() => setCopied(false), 3000);
    } catch {
      const r = await result.catch(() => null);
      if (r?.ok) setMade({ url: r.url, contact: r.contact });
      else toast(false, r?.message ?? "The link could not be made. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        disabled={busy}
        className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-medium hover:border-accent hover:text-accent disabled:opacity-60"
      >
        {busy ? "Copying…" : copied ? "Copied" : "Copy link"}
      </button>
      {made && <LinkBox url={made.url} contact={made.contact} />}
    </>
  );
}
