"use client";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-2 print:hidden">
      Print the day sheet
    </button>
  );
}
