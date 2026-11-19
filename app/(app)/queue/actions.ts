"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, ADMIN_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { runClock } from "@/lib/clock/run";
import { sendApprovedAction, type SendResult } from "@/lib/mail/send";

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
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

/** Sends one approved draft. The caller has already checked the person; this checks they can see the action. */
async function send(companyId: string, actionId: string): Promise<SendResult> {
  const supabase = await createClient();
  const { data: visible } = await supabase.from("agent_actions").select("id").eq("id", actionId).maybeSingle();
  if (!visible) return { ok: false, message: "That draft could not be found." };
  try {
    return await sendApprovedAction(companyId, actionId, await baseUrl());
  } catch {
    return { ok: false, message: "The message could not be sent. Check the server key in Vercel." };
  }
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
