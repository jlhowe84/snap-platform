"use client";

import type { ButtonHTMLAttributes } from "react";

/**
 * A submit button that asks first. For steps that undo someone's work
 * (cancel a shift, take a person off, reject a draft): one tap should not be
 * enough. Saying no leaves the form unsent.
 */
export function ConfirmButton({
  ask,
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { ask: string }) {
  return (
    <button
      {...rest}
      onClick={(e) => {
        if (!window.confirm(ask)) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    />
  );
}
