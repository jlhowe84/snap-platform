"use client";

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
      className={cx(className, "cursor-grab active:cursor-grabbing", over && "outline-2 outline-accent", pending && "opacity-60")}
    >
      {children}
    </li>
  );
}
