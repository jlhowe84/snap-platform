import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { allowedMailboxes, createGmailClient, loadServiceAccount } from "@/lib/gmail/client";
import { guardMail, mailSettingsFrom } from "./guard";
import { buildMime, isPlainAddress, toRaw } from "./mime";
import { senderMailbox } from "./send";

// Mail the platform sends on its own because a person asked for it by doing
// something: a booking confirmation, an alert to the office. It is not an
// agent draft, so it does not wait in the approval queue, but it passes
// lib/mail/guard.ts like everything else: while mail.test_mode is on, every
// one of these goes to the test address only.
//
// It never throws. A message that cannot go out must not undo the booking
// that caused it, so the caller gets true or false and carries on.
export async function sendSystemMail(companyId: string, mail: { to: string[]; subject: string; body: string }): Promise<boolean> {
  try {
    const to = [...new Set(mail.to.map((a) => a.trim().toLowerCase()).filter(isPlainAddress))].slice(0, 30);
    if (!to.length) return false;
    const admin = createAdminClient();
    const { data: rows } = await admin
      .from("settings")
      .select("key, value")
      .eq("company_id", companyId)
      .in("key", ["mail.test_mode", "mail.test_recipient", "mail.mailboxes", "mail.send_from"]);
    const settings = mailSettingsFrom(rows ?? []);
    if (settings.testMode && !settings.testRecipient) return false;
    const from = senderMailbox(rows ?? []);
    if (!from) return false;
    const sa = await loadServiceAccount(companyId);
    if (!sa) return false;
    const guarded = guardMail({ to, subject: mail.subject.replace(/[\r\n]+/g, " ").slice(0, 300) }, settings);
    const gmail = createGmailClient(sa, from, allowedMailboxes(rows ?? []));
    await gmail.sendRaw(toRaw(buildMime({ from, to: guarded.to, subject: guarded.subject, body: mail.body })));
    return true;
  } catch {
    return false;
  }
}

/** The addresses of the people who run the office: owners, admins and office staff who are active. */
export async function officeAddresses(companyId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data: roles } = await admin.from("profile_roles").select("profile_id").eq("company_id", companyId).in("role", ["owner", "admin", "office"]);
  const ids = [...new Set((roles ?? []).map((r) => r.profile_id))];
  if (!ids.length) return [];
  const { data: people } = await admin.from("profiles").select("email").eq("company_id", companyId).eq("active", true).in("id", ids);
  return (people ?? []).map((p) => p.email).filter(Boolean);
}
