import type { Database } from "@/lib/database.types";
import type { Tone } from "@/components/ui";

export type SupportStatus = Database["public"]["Enums"]["support_status"];

export const SUPPORT_STATUSES: SupportStatus[] = ["new", "open", "waiting_customer", "waiting_lab", "closed"];

export const SUPPORT_STATUS_LABEL: Record<SupportStatus, string> = {
  new: "New",
  open: "Open",
  waiting_customer: "Waiting on customer",
  waiting_lab: "Waiting on lab",
  closed: "Closed",
};

export const SUPPORT_STATUS_TONE: Record<SupportStatus, Tone> = {
  new: "accent",
  open: "info",
  waiting_customer: "warn",
  waiting_lab: "warn",
  closed: "muted",
};

export function isSupportStatus(v: unknown): v is SupportStatus {
  return typeof v === "string" && (SUPPORT_STATUSES as string[]).includes(v);
}

// The lists on the support desk. "needs" is everything waiting on us.
export const SUPPORT_VIEWS = [
  { key: "needs", label: "Needs a reply", statuses: ["new", "open"] },
  { key: "mine", label: "Mine", statuses: ["new", "open", "waiting_customer", "waiting_lab"] },
  { key: "unassigned", label: "Unassigned", statuses: ["new", "open", "waiting_customer", "waiting_lab"] },
  { key: "waiting", label: "Waiting", statuses: ["waiting_customer", "waiting_lab"] },
  { key: "closed", label: "Closed", statuses: ["closed"] },
] as const satisfies readonly { key: string; label: string; statuses: readonly SupportStatus[] }[];

export type SupportViewKey = (typeof SUPPORT_VIEWS)[number]["key"];

export function supportView(key: string | undefined) {
  return SUPPORT_VIEWS.find((v) => v.key === key) ?? SUPPORT_VIEWS[0];
}

/** Who may work the support desk. The database enforces the same list. */
export const SUPPORT_ROLES = ["owner", "admin", "office", "support"] as const;
