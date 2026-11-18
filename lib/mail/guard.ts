// Every outgoing email passes through here. While the company's
// mail.test_mode setting is true (the default, and the rule for the whole
// prototype phase), every recipient is replaced by mail.test_recipient and the
// original addresses go into the subject line, so nothing reaches a customer.

export type OutgoingMail = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
};

export type MailSettings = {
  testMode: boolean;
  testRecipient: string | null;
};

export class MailBlockedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "MailBlockedError";
  }
}

export function guardMail<T extends OutgoingMail>(mail: T, settings: MailSettings): T {
  if (!settings.testMode) return mail;
  if (!settings.testRecipient) {
    throw new MailBlockedError("Test mode is on and no test recipient is set, so nothing can be sent.");
  }
  const original = [...mail.to, ...(mail.cc ?? []), ...(mail.bcc ?? [])];
  return {
    ...mail,
    to: [settings.testRecipient],
    cc: [],
    bcc: [],
    subject: `[TEST to ${original.join(", ") || "nobody"}] ${mail.subject}`,
  };
}

/** Reads the settings rows as stored (jsonb values). Missing means test mode on. */
export function mailSettingsFrom(rows: { key: string; value: unknown }[]): MailSettings {
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const mode = get("mail.test_mode");
  const recipient = get("mail.test_recipient");
  return {
    testMode: mode !== false,
    testRecipient: typeof recipient === "string" && recipient.includes("@") ? recipient : null,
  };
}
