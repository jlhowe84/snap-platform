"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, ADMIN_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { runClock } from "@/lib/clock/run";

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

// Approving records the decision and the final wording. Nothing is emailed
// from here yet: sending arrives with the mail runner, and stays in test mode.
export async function decideDraft(_prev: QueueState, form: FormData): Promise<QueueState> {
  await requireStaff(STAFF_DESK);
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
  revalidatePath("/queue");
  return {
    ok: true,
    message: data === "rejected" ? "Rejected." : data === "edited" ? "Approved with your changes." : "Approved.",
  };
}

/** Approves every waiting draft of one type exactly as written. */
export async function approveAll(typeKey: string): Promise<void> {
  await requireStaff(STAFF_DESK);
  const key = z.string().regex(/^[a-z0-9_]+(\.[a-z0-9_]+)+$/).parse(typeKey);
  const supabase = await createClient();
  const { data: waiting } = await supabase
    .from("agent_actions")
    .select("id")
    .eq("status", "proposed")
    .eq("action_type_key", key)
    .limit(200);
  for (const a of waiting ?? []) {
    await supabase.rpc("decide_action", { p_action_id: a.id, p_approve: true });
  }
  revalidatePath("/queue");
}

// An owner or admin can run today's clock by hand. It releases lapsed holds
// and queues drafts for this company; it sends nothing.
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
