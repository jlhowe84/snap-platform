"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="min-h-12 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 print:hidden"
    >
      Print
    </button>
  );
}
