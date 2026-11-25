import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { planText, smsSettingsFrom } from "./guard";
import { sendTwilio, twilioKeys } from "./twilio";

// Sends logged crew texts through the guard (lib/sms/guard.ts). A server job:
// it runs right after a text is logged and again with the daily run. While
// texts are off or the carrier keys are missing it changes nothing, so the
// texts stay logged.

type Admin = ReturnType<typeof createAdminClient>;
export type SendTextsResult = { sent: number; skipped: number; failed: number; off: boolean };

export async function sendLoggedTexts(companyId: string, ids?: string[], admin: Admin = createAdminClient()): Promise<SendTextsResult> {
  const result: SendTextsResult = { sent: 0, skipped: 0, failed: 0, off: false };
  const { data: rows } = await admin.from("settings").select("key, value").eq("company_id", companyId).like("key", "sms.%");
  const settings = smsSettingsFrom(rows ?? []);
  const keys = twilioKeys();
  if (!settings.enabled || !keys) {
    result.off = true;
    return result;
  }

  let q = admin
    .from("text_messages")
    .select("id, crew_member_id, to_phone, body, created_at, crew_members(full_name)")
    .eq("company_id", companyId)
    .eq("status", "logged")
    .order("created_at")
    .limit(50);
  if (ids) q = q.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const { data: texts } = await q;

  const now = new Date();
  for (const t of texts ?? []) {
    const { data: answer } = t.crew_member_id
      ? await admin
          .from("sms_consents")
          .select("opted_in, phone")
          .eq("crew_member_id", t.crew_member_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };
    const optedIn = answer?.opted_in ? answer.phone : null;
    const firstName = t.crew_members?.full_name?.split(/\s+/)[0] ?? null;
    const plan = planText(t, optedIn, settings, true, now, firstName);
    if (!plan.send) {
      await admin.from("text_messages").update({ status: "skipped", note: plan.reason }).eq("id", t.id).eq("status", "logged");
      result.skipped++;
      continue;
    }
    // Claim the row first so two runs cannot both send it.
    const { data: claimed } = await admin
      .from("text_messages")
      .update({ status: "failed", note: "sending" })
      .eq("id", t.id)
      .eq("status", "logged")
      .select("id");
    if (!claimed?.length) continue;
    const sent = await sendTwilio(keys, plan.to, plan.body);
    if (sent.ok) {
      await admin
        .from("text_messages")
        .update({ status: "sent", provider_id: sent.sid, sent_at: new Date().toISOString(), note: plan.test ? "sent to the test number" : null })
        .eq("id", t.id);
      result.sent++;
    } else {
      await admin.from("text_messages").update({ status: "failed", note: sent.error }).eq("id", t.id);
      result.failed++;
    }
  }
  return result;
}

/** The daily sweep: every company with texts switched on. */
export async function sendAllLoggedTexts(): Promise<SendTextsResult[]> {
  const admin = createAdminClient();
  const { data: on } = await admin.from("settings").select("company_id, value").eq("key", "sms.enabled");
  const out: SendTextsResult[] = [];
  for (const row of on ?? []) {
    if (row.value !== true) continue;
    out.push(await sendLoggedTexts(row.company_id, undefined, admin));
  }
  return out;
}
