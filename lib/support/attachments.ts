import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { allowedMailboxes, createGmailClient, loadServiceAccount, type GmailPart } from "@/lib/gmail/client";

// Fetching one file that came with a support message. The file stays in the
// mailbox; this reads it when a signed-in member of staff opens it. The
// caller has already shown, through the person's own session, that they may
// see the message.

function findPartById(part: GmailPart | undefined, id: string): GmailPart | null {
  if (!part) return null;
  if (part.partId === id) return part;
  for (const child of part.parts ?? []) {
    const hit = findPartById(child, id);
    if (hit) return hit;
  }
  return null;
}

export async function fetchAttachment(input: {
  companyId: string;
  mailbox: string;
  gmailMessageId: string;
  part: string;
}): Promise<Uint8Array | null> {
  const admin = createAdminClient();
  const { data: rows } = await admin.from("settings").select("key, value").eq("company_id", input.companyId).eq("key", "mail.mailboxes");
  const boxes = allowedMailboxes(rows ?? []);
  if (!boxes.includes(input.mailbox.toLowerCase())) return null;
  const sa = await loadServiceAccount(input.companyId);
  if (!sa) return null;
  const gmail = createGmailClient(sa, input.mailbox, boxes);
  // The mailbox hands out a fresh key for a file on every read, so the
  // message is read again to find the key for this part.
  const message = await gmail.getMessage(input.gmailMessageId);
  const key = findPartById(message.payload, input.part)?.body?.attachmentId;
  if (!key) return null;
  return gmail.getAttachment(input.gmailMessageId, key);
}
