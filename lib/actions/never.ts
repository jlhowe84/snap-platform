// The actions no agent may ever take on its own. This list must match
// private.never_action_keys() in the database, which is the real guard; a test
// (tests/never.test.ts) fails if the two drift apart.
export const NEVER_ACTION_KEYS = [
  "money.discount",
  "money.refund",
  "money.move",
  "pricing.change",
  "job.cancel",
  "photo_day.postpone",
  "agreement.contract",
  "support.complaint_reply",
  "booth.guest_message",
] as const;

export type NeverActionKey = (typeof NEVER_ACTION_KEYS)[number];

export function isNeverAction(key: string): key is NeverActionKey {
  return (NEVER_ACTION_KEYS as readonly string[]).includes(key);
}
