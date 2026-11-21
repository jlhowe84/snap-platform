"use client";

import { useEffect, useState, type ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import { Spinner } from "./submit-button";

/**
 * A submit button that asks first. For steps that undo someone's work
 * (cancel a shift, take a person off, reject a draft): one tap should not be
 * enough. The first press swaps the button for the question with Yes and No
 * beside it; only Yes sends the form. It asks on the page, not in a browser
 * pop-up, because a pop-up freezes the page while it is open. While the form
 * is being sent it dims and shows a spinner, like every other submit button.
 */
export function ConfirmButton({
  ask,
  yes = "Yes",
  onClick,
  children,
  disabled,
  className,
  name,
  value,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { ask: string; yes?: string }) {
  const { pending } = useFormStatus();
  const [asking, setAsking] = useState(false);

  // Once the form has been sent and has come back, show the plain button again.
  const [wasPending, setWasPending] = useState(false);
  if (pending !== wasPending) {
    setWasPending(pending);
    if (!pending) setAsking(false);
  }

  useEffect(() => {
    if (!asking) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAsking(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [asking]);

  if (!asking) {
    return (
      <button {...rest} type="button" disabled={disabled || pending} className={className} onClick={() => setAsking(true)}>
        {children}
      </button>
    );
  }

  return (
    <span role="group" aria-label={ask} className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-risk/40 bg-surface-2 px-3 py-2 text-left text-sm">
      <span className="min-w-0 text-text [overflow-wrap:anywhere]">{ask}</span>
      <button
        {...rest}
        type="submit"
        name={name}
        value={value}
        autoFocus
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={onClick}
        className="min-h-9 rounded-lg bg-risk px-3 py-1 font-semibold text-white aria-busy:cursor-progress aria-busy:opacity-60"
      >
        {pending && <Spinner />}
        {yes}
      </button>
      <button type="button" disabled={pending} onClick={() => setAsking(false)} className="min-h-9 rounded-lg border border-line px-3 py-1 hover:bg-bg disabled:opacity-60">
        No
      </button>
    </span>
  );
}
