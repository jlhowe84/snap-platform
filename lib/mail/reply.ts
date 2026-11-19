import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { allowedMailboxes, createGmailClient, loadServiceAccount } from "@/lib/gmail/client";
import { guardMail, mailSettingsFrom, MailBlockedError } from "./guard";
import { buildMime, isPlainAddress, replySubject, toRaw } from "./mime";
import { firstNameOf } from "@/lib/support/saved";

// A support reply written by a person. It runs on the server with the service
// role, after the caller has checked the signed-in person may work the
// support desk. Like every send, the recipient passes lib/mail/guard.ts.
//
// Live: the reply goes to the customer from the conversation's own mailbox,
// inside the same Gmail thread, and is stored as an "out" message in the
// sender's name. The later mail sync meets the same Gmail id and skips it.
//
// Test mode: the reply goes only to the test recipient, outside the
// customer's thread, and is stored as a staff note that says so. The
// conversation's reply times and status are left alone, because the customer
// did not get anything.

export type ReplyResult =
  | { ok: true; testMode: boolean; sentTo: string[] }
  | { ok: false; message: string };

const MAX_BODY = 20_000;

export async function sendSupportReply(input: {
  companyId: string;
  authorId: string;
  conversationId: string;
  body: string;
}): Promise<ReplyResult> {
  const body = input.body.replace(/\r\n/g, "\n").trim();
  if (!body || body.length > MAX_BODY) return { ok: false, message: "Write a reply first (20,000 characters at most)." };

  const admin = createAdminClient();
  const [{ data: conversation }, { data: rows }, { data: author }, { data: company }] = await Promise.all([
    admin
      .from("support_conversations")
      .select("id, mailbox, gmail_thread_id, subject, customer_email")
      .eq("id", input.conversationId)
      .eq("company_id", input.companyId)
      .maybeSingle(),
    admin
      .from("settings")
      .select("key, value")
      .eq("company_id", input.companyId)
      .in("key", ["mail.test_mode", "mail.test_recipient", "mail.mailboxes"]),
    admin.from("profiles").select("full_name").eq("id", input.authorId).eq("company_id", input.companyId).maybeSingle(),
    admin.from("companies").select("name").eq("id", input.companyId).maybeSingle(),
  ]);
  if (!conversation) return { ok: false, message: "That conversation was not found." };
  const to = conversation.customer_email?.trim().toLowerCase();
  if (!to || !isPlainAddress(to)) return { ok: false, message: "This conversation has no address to reply to." };

  const settings = mailSettingsFrom(rows ?? []);
  if (settings.testMode && !settings.testRecipient) {
    return { ok: false, message: "No test address is set yet, so nothing was sent." };
  }
  const boxes = allowedMailboxes(rows ?? []);
  const from = conversation.mailbox.toLowerCase();
  if (!boxes.includes(from)) return { ok: false, message: "This conversation's mailbox is no longer set up to send from." };

  let sa;
  try {
    sa = await loadServiceAccount(input.companyId);
  } catch {
    return { ok: false, message: "The Workspace key could not be read." };
  }
  if (!sa) return { ok: false, message: "No Workspace key is stored yet." };

  try {
    const gmail = createGmailClient(sa, from, boxes);
    const guarded = guardMail({ to: [to], subject: replySubject(conversation.subject) }, settings);

    // Only a live reply joins the customer's thread.
    let inReplyTo: string | null = null;
    let threadId: string | undefined;
    if (!settings.testMode && conversation.gmail_thread_id) {
      threadId = conversation.gmail_thread_id;
      const { data: last } = await admin
        .from("support_messages")
        .select("gmail_message_id")
        .eq("conversation_id", conversation.id)
        .eq("direction", "in")
        .not("gmail_message_id", "is", null)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last?.gmail_message_id) inReplyTo = await gmail.messageIdHeader(last.gmail_message_id).catch(() => null);
    }

    const sent = await gmail.sendRaw(
      toRaw(buildMime({ from, fromName: senderName(author?.full_name, company?.name), to: guarded.to, subject: guarded.subject, body, inReplyTo })),
      threadId,
    );

    const stored = settings.testMode
      ? await admin.from("support_messages").insert({
          company_id: input.companyId,
          conversation_id: conversation.id,
          direction: "note",
          author_id: input.authorId,
          body_text: `Test reply. It went only to ${guarded.to.join(", ")}; the customer did not get it.\n\n${body}`,
        })
      : await admin.from("support_messages").insert({
          company_id: input.companyId,
          conversation_id: conversation.id,
          direction: "out",
          gmail_message_id: sent.id,
          from_address: from,
          to_addresses: guarded.to,
          body_text: body,
          author_id: input.authorId,
        });
    if (stored.error) {
      // The mail left; say so, so nobody sends it twice.
      return { ok: false, message: "The reply was sent, but it could not be saved here. Do not send it again; check for new mail in a few minutes." };
    }
    return { ok: true, testMode: settings.testMode, sentTo: guarded.to };
  } catch (e) {
    const message =
      e instanceof MailBlockedError
        ? e.message
        : e instanceof Error && /^(Gmail|Google) /.test(e.message)
          ? `${e.message}.`
          : "The reply could not be sent.";
    return { ok: false, message };
  }
}

/**
 * The name a customer sees beside the support address: the person who
 * answered and the company, like "John at SNAP Photo". The address stays the
 * shared mailbox, so the customer's next message comes back to the queue.
 */
export function senderName(fullName: string | null | undefined, companyName: string | null | undefined): string | null {
  const first = firstNameOf(fullName);
  const company = (companyName ?? "").trim();
  if (first && company) return `${first} at ${company}`;
  return first || company || null;
}
