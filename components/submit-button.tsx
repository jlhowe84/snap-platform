"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

/**
 * A form's button that shows the form is working: while the form it sits in
 * is being sent it dims, cannot be pressed twice and shows a small spinner.
 * Use it for any button that saves, sends or changes something.
 */
export function SubmitButton({ children, disabled, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button
      {...rest}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={(className ?? "") + " aria-busy:cursor-progress aria-busy:opacity-60"}
    >
      {pending && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true" className="mr-1.5 inline-block animate-spin align-[-2px]">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
