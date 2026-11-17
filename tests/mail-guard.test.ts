import { describe, expect, it } from "vitest";
import { guardMail, mailSettingsFrom, MailBlockedError } from "@/lib/mail/guard";

const mail = { to: ["parent@example.com"], cc: ["coach@example.com"], subject: "Photo day" };

describe("mail guard", () => {
  it("rewrites every recipient in test mode", () => {
    const out = guardMail(mail, { testMode: true, testRecipient: "owner@example.com" });
    expect(out.to).toEqual(["owner@example.com"]);
    expect(out.cc).toEqual([]);
    expect(out.subject).toContain("parent@example.com");
  });
  it("blocks when test mode has no recipient", () => {
    expect(() => guardMail(mail, { testMode: true, testRecipient: null })).toThrow(MailBlockedError);
  });
  it("treats missing settings as test mode", () => {
    expect(mailSettingsFrom([])).toEqual({ testMode: true, testRecipient: null });
    expect(mailSettingsFrom([{ key: "mail.test_mode", value: false }]).testMode).toBe(false);
  });
});
