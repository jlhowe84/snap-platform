// Every outgoing text passes through here, the way mail passes through
// lib/mail/guard.ts. Texts go nowhere unless sms.enabled is true and the
// carrier keys are set. While sms.test_mode is true (the default) every text
// goes to sms.test_recipient instead, marked with who it was for.

import { toUsMobile } from "./phone";
import { toGsm } from "./text";

export type SmsSettings = { enabled: boolean; testMode: boolean; testRecipient: string | null };

/** Reads the settings rows as stored (jsonb values). Missing means off, and test mode on. */
export function smsSettingsFrom(rows: { key: string; value: unknown }[]): SmsSettings {
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const recipient = get("sms.test_recipient");
  return {
    enabled: get("sms.enabled") === true,
    testMode: get("sms.test_mode") !== false,
    testRecipient: typeof recipient === "string" ? toUsMobile(recipient) : null,
  };
}

export type TextPlan =
  | { send: true; to: string; body: string; test: boolean }
  | { send: false; reason: string };

/**
 * What to do with one logged text. `optedInPhone` is the crew member's answer
 * at send time: someone who said no after the text was logged gets nothing.
 */
export function planText(
  text: { to_phone: string; body: string; created_at: string },
  optedInPhone: string | null,
  settings: SmsSettings,
  hasKeys: boolean,
  now: Date,
  firstName?: string | null,
): TextPlan {
  if (!settings.enabled) return { send: false, reason: "texts are off" };
  if (!hasKeys) return { send: false, reason: "the carrier keys are not set" };
  if (optedInPhone !== text.to_phone) return { send: false, reason: "no longer opted in at this number" };
  // A text logged while sending was off is stale by the time it is switched on.
  if (now.getTime() - new Date(text.created_at).getTime() > 6 * 60 * 60 * 1000) {
    return { send: false, reason: "too old to send" };
  }
  if (!settings.testMode) return { send: true, to: text.to_phone, body: text.body, test: false };
  if (!settings.testRecipient) return { send: false, reason: "test mode is on and no test number is set" };
  const who = firstName?.trim() ? firstName.trim() : text.to_phone;
  return { send: true, to: settings.testRecipient, body: toGsm(`TEST for ${who}: ${text.body}`), test: true };
}
