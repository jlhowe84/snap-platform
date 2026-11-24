// The kinds of notice the platform writes (see the notices migration). The
// default is quiet: each one is something that needs that person.

export const NOTICE_KINDS = ["task.assigned", "date.changed", "queue.at_risk", "makeup.booked", "makeup.upcoming"] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

export const NOTICE_LABEL: Record<NoticeKind, { name: string; hint: string }> = {
  "task.assigned": { name: "Tasks given to me", hint: "When someone else assigns you a task." },
  "date.changed": { name: "Photo day changes", hint: "When a photo day moves, is postponed or is cancelled. Office, admins and owners." },
  "makeup.booked": { name: "Makeup and retake bookings", hint: "When a parent books or cancels a session. Office, admins and owners." },
  "makeup.upcoming": { name: "Today's makeups and retakes", hint: "A morning note on days with sessions booked. Office, admins and owners." },
  "queue.at_risk": { name: "Date-at-risk notes", hint: "When a date-at-risk note is waiting for a decision. Admins and owners." },
};

export function isNoticeKind(value: unknown): value is NoticeKind {
  return typeof value === "string" && (NOTICE_KINDS as readonly string[]).includes(value);
}
