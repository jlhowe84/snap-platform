import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { allowedMailboxes, createGmailClient, loadServiceAccount } from "@/lib/gmail/client";
import { PORTAL_LINK } from "@/lib/clock/drafts";
import { newPortalToken, portalLinkExpiry } from "@/lib/portal/token";
import { guardMail, mailSettingsFrom, MailBlockedError } from "./guard";
import { buildMime, isPlainAddress, toRaw } from "./mime";
import { fieldHasAddress } from "@/lib/mail/addresses";

// The one place an approved draft becomes an email. It runs on the server
// with the service role, after the caller has checked the signed-in person.
// Order matters: everything that can refuse does so before the action is
// claimed, the recipients pass lib/mail/guard.ts, and the claim in the
// database (action_send_begin) makes a message go out once.

export type SendResult = { ok: true; sentTo: string[]; testMode: boolean } | { ok: false; message: string };

const Draft = z.object({
  to: z.array(z.string()).max(20),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(20000),
});

const Claim = z.object({
  action_type_key: z.string(),
  draft: Draft,
  record_refs: z.object({ job_id: z.uuid().nullable().optional() }).nullable(),
  decided_by: z.uuid(),
});

/** The mailbox mail leaves from: mail.send_from when it is an allowed mailbox, else the first allowed one. */
export function senderMailbox(rows: { key: string; value: unknown }[]): string | null {
  const allowed = allowedMailboxes(rows);
  const wanted = rows.find((r) => r.key === "mail.send_from")?.value;
  if (typeof wanted === "string" && allowed.includes(wanted.toLowerCase())) return wanted.toLowerCase();
  return allowed[0] ?? null;
}

export async function sendApprovedAction(companyId: string, actionId: string, baseUrl: string): Promise<SendResult> {
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("settings")
    .select("key, value")
    .eq("company_id", companyId)
    .in("key", ["mail.test_mode", "mail.test_recipient", "mail.mailboxes", "mail.send_from"]);
  const settings = mailSettingsFrom(rows ?? []);
  if (settings.testMode && !settings.testRecipient) {
    return { ok: false, message: "No test address is set yet, so nothing was sent." };
  }
  const from = senderMailbox(rows ?? []);
  if (!from) return { ok: false, message: "No mailbox is set up to send from." };

  let sa;
  try {
    sa = await loadServiceAccount(companyId);
  } catch {
    return { ok: false, message: "The Workspace key could not be read." };
  }
  if (!sa) return { ok: false, message: "No Workspace key is stored yet." };

  // From here the action is claimed: every exit records how it ended.
  const { data: claimed, error: claimError } = await admin.rpc("action_send_begin", {
    p_company: companyId,
    p_action: actionId,
  });
  if (claimError) return { ok: false, message: sentence(claimError.message) };

  const finish = async (ok: boolean, result: Record<string, unknown> | null, error?: string) => {
    await admin.rpc("action_send_finish", {
      p_company: companyId,
      p_action: actionId,
      p_ok: ok,
      p_result: result as never,
      p_error: error,
    });
  };

  try {
    const claim = Claim.parse(claimed);
    const intended = claim.draft.to.map((a) => a.trim()).filter(Boolean);
    if (!intended.length) throw new SendProblem("This draft has no address to send to.");
    if (intended.some((a) => !isPlainAddress(a))) throw new SendProblem("One of the addresses is not an email address.");

    let body = claim.draft.body;
    let portalLinkId: string | null = null;
    if (body.includes(PORTAL_LINK)) {
      const jobId = claim.record_refs?.job_id;
      if (!jobId) throw new SendProblem("This draft needs a portal link, and it is not tied to a job.");
      const link = await mintPortalLink(admin, companyId, jobId, intended, claim.decided_by, baseUrl);
      body = body.split(PORTAL_LINK).join(link.url);
      portalLinkId = link.id;
    }

    const guarded = guardMail({ to: intended, subject: claim.draft.subject }, settings);
    const gmail = createGmailClient(sa, from, allowedMailboxes(rows ?? []));
    const sent = await gmail.sendRaw(toRaw(buildMime({ from, to: guarded.to, subject: guarded.subject, body })));

    await finish(true, {
      sent_at: new Date().toISOString(),
      message_id: sent.id,
      from,
      sent_to: guarded.to,
      intended_to: intended,
      test_mode: settings.testMode,
      portal_link_id: portalLinkId,
    });
    return { ok: true, sentTo: guarded.to, testMode: settings.testMode };
  } catch (e) {
    const message =
      e instanceof SendProblem || e instanceof MailBlockedError
        ? e.message
        : e instanceof Error && /^(Gmail|Google) /.test(e.message)
          ? `${e.message}.`
          : "The message could not be sent.";
    await finish(false, null, message).catch(() => undefined);
    return { ok: false, message };
  }
}

class SendProblem extends Error {}

function sentence(message: string) {
  const m = message.trim();
  return m.charAt(0).toUpperCase() + m.slice(1) + (m.endsWith(".") ? "" : ".");
}

/**
 * A fresh portal link for the coordinator this message is written to. The
 * token goes into the email and nowhere else; only its hash is stored.
 */
async function mintPortalLink(
  admin: ReturnType<typeof createAdminClient>,
  companyId: string,
  jobId: string,
  intended: string[],
  createdBy: string,
  baseUrl: string,
) {
  const [{ data: people }, { data: days }] = await Promise.all([
    admin.from("job_contacts").select("contacts(id, email)").eq("job_id", jobId),
    admin.from("photo_days").select("date").eq("job_id", jobId).order("date", { ascending: false }).limit(1),
  ]);
  const contact = (people ?? [])
    .map((p) => p.contacts as { id: string; email: string | null } | null)
    .find((c) => fieldHasAddress(c?.email, intended));
  if (!contact) {
    throw new SendProblem("The portal link needs one of the job's contacts in the To line, and none is there.");
  }
  const { token, hash } = newPortalToken();
  const { data, error } = await admin
    .from("portal_links")
    .insert({
      company_id: companyId,
      job_id: jobId,
      contact_id: contact.id,
      token_hash: hash,
      expires_at: portalLinkExpiry(days?.[0]?.date).toISOString(),
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (error || !data) throw new SendProblem("The portal link could not be made.");
  return { id: data.id, url: `${baseUrl.replace(/\/+$/, "")}/p/${token}` };
}
