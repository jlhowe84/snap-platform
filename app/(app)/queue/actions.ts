"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, ADMIN_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { liveSiteUrl } from "@/lib/site-url";
import { runClock } from "@/lib/clock/run";
import { sendApprovedAction, type SendResult } from "@/lib/mail/send";
import { MAKEUP_OFFER_KEY } from "@/lib/production/makeup-offer";
import { CREW_NOTICE_KEY } from "@/lib/staffing/notices";
import { crewShiftText } from "@/lib/sms/crew";
import { sendLoggedTexts } from "@/lib/sms/send";

export type QueueState = { ok: boolean; message: string } | null;

const STAFF_DESK = ["owner", "admin", "office", "support"] as const;

const Decide = z.object({
  id: z.uuid(),
  intent: z.enum(["approve", "reject"]),
  to: z.string().max(2000),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(20000),
  note: z.string().trim().max(500).optional(),
});

async function baseUrl() {
  // Links in a sent message open the live site, not the preview that sent it.
  return liveSiteUrl(await headers());
}

/** Sends one approved draft. The caller has already checked the person; this checks they can see the action. */
async function send(companyId: string, actionId: string): Promise<SendResult> {
  const supabase = await createClient();
  const { data: visible } = await supabase.from("agent_actions").select("id").eq("id", actionId).maybeSingle();
  if (!visible) return { ok: false, message: "That draft could not be found." };
  try {
    const result = await sendApprovedAction(companyId, actionId, await baseUrl());
    if (result.ok) await afterSend(companyId, actionId);
    return result;
  } catch {
    return { ok: false, message: "The message could not be sent. Check the server key in Vercel." };
  }
}

/**
 * A sent makeup offer moves its order from To do to Makeup offered. A sent crew
 * shift notice also logs a text for a crew member who said yes to texts.
 */
async function afterSend(companyId: string, actionId: string) {
  const supabase = await createClient();
  const { data: action } = await supabase.from("agent_actions").select("action_type_key, record_refs").eq("id", actionId).maybeSingle();
  if (action?.action_type_key === CREW_NOTICE_KEY) return logCrewText(companyId, actionId, action.record_refs);
  if (action?.action_type_key !== MAKEUP_OFFER_KEY) return;
  const caseId = (action.record_refs as { case_id?: unknown } | null)?.case_id;
  if (typeof caseId !== "string" || !z.uuid().safeParse(caseId).success) return;
  // Office roles only may write the list; for anyone else this changes nothing.
  await supabase.from("prepay_photo_cases").update({ status: "offered" }).eq("id", caseId).eq("status", "open");
  revalidatePath("/production/no-photos");
}

const CrewRefs = z.object({ shift_id: z.uuid(), crew_member_id: z.uuid(), kind: z.enum(["added", "removed"]) });

/** Logs the text twin of a crew shift notice. Nothing is sent while texts are off. */
async function logCrewText(companyId: string, actionId: string, refs: unknown) {
  const r = CrewRefs.safeParse(refs);
  if (!r.success) return;
  const supabase = await createClient();
  const [{ data: s }, { data: company }] = await Promise.all([
    supabase.from("shifts").select("position, start_time, end_time, photo_days(date), jobs(name)").eq("id", r.data.shift_id).maybeSingle(),
    supabase.from("companies").select("name").maybeSingle(),
  ]);
  if (!s?.photo_days || !s.jobs) return;
  const body = crewShiftText({
    kind: r.data.kind,
    company: company?.name ?? null,
    jobName: s.jobs.name,
    date: s.photo_days.date,
    position: s.position,
    startTime: s.start_time,
    endTime: s.end_time,
    link: `${await baseUrl()}/shifts`,
  });
  // The database checks the crew member said yes; for anyone else it logs nothing.
  const { data: textId } = await supabase.rpc("log_crew_text", {
    p_crew_member_id: r.data.crew_member_id,
    p_kind: `crew.${r.data.kind}`,
    p_body: body,
    p_agent_action_id: actionId,
  });
  // Off, or with no carrier keys, this leaves the text logged.
  if (textId) await sendLoggedTexts(companyId, [textId]).catch(() => undefined);
}

const sentLine = (r: Extract<SendResult, { ok: true }>) =>
  r.testMode ? `Sent to the test address (${r.sentTo.join(", ")}).` : `Sent to ${r.sentTo.join(", ")}.`;

// Approving records the decision and the final wording, then sends. While
// mail.test_mode is on, lib/mail/guard.ts sends it to the test address only.
// If it cannot be sent, the approval stands and the draft can be sent later.
export async function decideDraft(_prev: QueueState, form: FormData): Promise<QueueState> {
  const viewer = await requireStaff(STAFF_DESK);
  const parsed = Decide.safeParse({
    id: form.get("id"),
    intent: form.get("intent"),
    to: form.get("to") ?? "",
    subject: form.get("subject"),
    body: form.get("body"),
    note: form.get("note") || undefined,
  });
  if (!parsed.success) return { ok: false, message: "A draft needs a subject and a message." };
  const d = parsed.data;
  const to = d.to.split(/[,\s]+/).filter(Boolean);
  if (d.intent === "approve" && to.some((a) => !z.email().safeParse(a).success)) {
    return { ok: false, message: "One of the addresses does not look like an email address." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decide_action", {
    p_action_id: d.id,
    p_approve: d.intent === "approve",
    p_draft: d.intent === "approve" ? { to, subject: d.subject, body: d.body } : undefined,
    p_note: d.note,
  });
  if (error) return { ok: false, message: error.message };
  if (data === "rejected") {
    revalidatePath("/queue");
    return { ok: true, message: "Rejected." };
  }
  const sent = await send(viewer.companyId, d.id);
  revalidatePath("/queue");
  const approved = data === "edited" ? "Approved with your changes." : "Approved.";
  return { ok: true, message: sent.ok ? `${approved} ${sentLine(sent)}` : `${approved} Not sent: ${sent.message}` };
}

/** Sends a draft that was approved earlier, or tries a failed one again. */
export async function sendNow(_prev: QueueState, form: FormData): Promise<QueueState> {
  const viewer = await requireStaff(STAFF_DESK);
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { ok: false, message: "That draft could not be found." };
  const sent = await send(viewer.companyId, id.data);
  revalidatePath("/queue");
  return sent.ok ? { ok: true, message: sentLine(sent) } : { ok: false, message: sent.message };
}

/** Approves every waiting draft of one type exactly as written, and sends each. */
export async function approveAll(typeKey: string): Promise<void> {
  const viewer = await requireStaff(STAFF_DESK);
  const key = z.string().regex(/^[a-z0-9_]+(\.[a-z0-9_]+)+$/).parse(typeKey);
  const supabase = await createClient();
  const { data: waiting } = await supabase
    .from("agent_actions")
    .select("id")
    .eq("status", "proposed")
    .eq("action_type_key", key)
    .limit(200);
  for (const a of waiting ?? []) {
    const { error } = await supabase.rpc("decide_action", { p_action_id: a.id, p_approve: true });
    if (!error) await send(viewer.companyId, a.id);
  }
  revalidatePath("/queue");
}

// An owner or admin can run today's clock by hand. It releases lapsed holds
// and queues drafts for this company; it sends nothing by itself.
export async function runClockNow(): Promise<QueueState> {
  const viewer = await requireStaff(ADMIN_ROLES);
  if (!viewer.companyId) return { ok: false, message: "No company." };
  try {
    const [r] = await runClock(viewer.companyId);
    if (!r) return { ok: false, message: "Nothing ran." };
    revalidatePath("/queue");
    if (r.errors.length) return { ok: false, message: `Queued ${r.queued} of ${r.due}. ${r.errors.length} could not be drafted.` };
    return { ok: true, message: r.queued ? `Queued ${r.queued} draft${r.queued === 1 ? "" : "s"}.` : "Nothing new is due today." };
  } catch {
    return { ok: false, message: "The clock could not run. Check the server key in Vercel." };
  }
}
