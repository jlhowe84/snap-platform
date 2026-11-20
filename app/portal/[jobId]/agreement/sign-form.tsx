"use client";

import { useActionState } from "react";
import { useToast } from "@/components/toast";
import type { AgreementSection } from "@/lib/agreement/pdf";
import { signAgreement, type SignState } from "./actions";

const input =
  "rounded-lg border border-line bg-bg px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:outline-none";

export function SignForm({
  jobId,
  versionId,
  sections,
  canSign,
}: {
  jobId: string;
  versionId: string;
  sections: AgreementSection[];
  canSign: boolean;
}) {
  const [state, action, pending] = useActionState<SignState, FormData>(signAgreement.bind(null, jobId, versionId), null);
  useToast(state);
  return (
    <form action={action} className="space-y-4">
      {sections.map((s) => (
        <section key={s.key} className="rounded-xl border border-line bg-surface p-5">
          <h2 className="mb-2 font-display text-lg font-semibold uppercase tracking-wider">{s.title}</h2>
          <p className="whitespace-pre-line text-sm">{s.body}</p>
          {s.initial && (
            <label className="mt-4 flex items-center gap-3 text-sm">
              <span className="text-muted">Your initials</span>
              <input
                name={`initial_${s.key}`}
                required
                maxLength={5}
                autoComplete="off"
                className={`${input} w-20 uppercase`}
                aria-label={`Initials for ${s.title}`}
              />
            </label>
          )}
        </section>
      ))}

      <section className="space-y-3 rounded-xl border border-accent/50 bg-surface p-5">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Type your full name to sign</span>
          <input name="signer_name" required minLength={2} maxLength={200} autoComplete="name" className={`${input} w-full`} />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="agree" required className="mt-1 accent-[var(--accent)]" />
          <span>I have read this agreement and sign it for our league. Typing my name counts as my signature.</span>
        </label>
        <button
          disabled={pending || !canSign}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Signing…" : "Sign and confirm our date"}
        </button>
        {!canSign && <p className="text-xs text-muted">Staff can read this page but only the coordinator can sign.</p>}
        {state && !state.ok && <p className="text-sm text-risk">{state.message}</p>}
      </section>
    </form>
  );
}
