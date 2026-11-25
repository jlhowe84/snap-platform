"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { cx } from "@/components/ui";

// One slot on the schedule. On a computer, drag a slot onto another to swap
// what they hold. Phones use the Swap button instead (touch screens do not
// drag), so this only adds to the page; it never replaces a button.
const TYPE = "application/x-snap-slot";

export function DraggableSlot({
  slotId,
  enabled,
  swap,
  className,
  children,
}: {
  slotId: string;
  enabled: boolean;
  swap: (fromId: string, toId: string) => Promise<void>;
  className?: string;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  const [pending, start] = useTransition();

  if (!enabled) return <li className={className}>{children}</li>;

  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(TYPE, slotId);
        e.dataTransfer.effectAllowed = "move";
        // Drag only this slot, never a highlighted run of text across slots.
        window.getSelection()?.removeAllRanges();
        e.dataTransfer.setDragImage(e.currentTarget, 12, 12);
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const from = e.dataTransfer.getData(TYPE);
        if (!from || from === slotId) return;
        start(() => swap(from, slotId));
      }}
      title="Drag onto another slot to swap them"
      className={cx(className, "cursor-grab select-none active:cursor-grabbing", over && "outline-2 outline-accent", pending && "opacity-60")}
    >
      {children}
    </li>
  );
}

// The tap way to swap: press Swap on one slot, then Swap here on another. The
// page refreshes in place and drops the picked slot from the address, so it
// does not jump back to the top.
export function SwapHere({ fromId, toId, swap, doneHref }: { fromId: string; toId: string; swap: (fromId: string, toId: string) => Promise<void>; doneHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await swap(fromId, toId);
          router.replace(doneHref, { scroll: false });
        })
      }
      className="shrink-0 rounded border border-accent px-1.5 py-0.5 text-xs text-accent disabled:opacity-60"
    >
      {pending ? "Swapping…" : "Swap here"}
    </button>
  );
}
