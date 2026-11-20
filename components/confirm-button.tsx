"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import { Spinner } from "./submit-button";

/**
 * A submit button that asks first. For steps that undo someone's work
 * (cancel a shift, take a person off, reject a draft): one tap should not be
 * enough. Saying no leaves the form unsent. While the form is being sent it
 * dims and shows a spinner, like every other submit button.
 */
export function ConfirmButton({
  ask,
  onClick,
  children,
  disabled,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { ask: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      {...rest}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={(className ?? "") + " aria-busy:cursor-progress aria-busy:opacity-60"}
      onClick={(e) => {
        if (!window.confirm(ask)) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    >
      {pending && <Spinner />}
      {children}
    </button>
  );
}
