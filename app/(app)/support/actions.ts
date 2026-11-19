"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SUPPORT_ROLES, isSupportStatus } from "@/lib/support/labels";

// The support desk. People work a conversation (who has it, where it stands,
// what it is about) and add notes. RLS and a database guard keep the mail
// itself out of reach. Nothing here sends mail.

export type SupportState = { ok: boolean; message: string } | null;

/** Reads new mail from the support mailbox now. Read only. */
export async function checkMail(): Promise<SupportState> {
  const viewer = await requireStaff(SUPPORT_ROLES);
  const { runSupportSync } = await import("@/lib/support/sync");
  try {
    const results = await runSupportSync(viewer.companyId);
    revalidatePath("/support");
    if (results.length === 0) return { ok: false, message: "No support mailbox is set up yet." };
    const failed = results.find((r) => r.error && !r.partial);
    if (failed) return { ok: false, message: `Could not read the mailbox. ${failed.error}` };
    const added = results.reduce((n, r) => n + r.messages, 0);
    const more = results.some((r) => r.partial);
    const found = added === 0 ? "No new mail." : `${added} new ${added === 1 ? "message" : "messages"}.`;
    return { ok: true, message: more ? `${found} There is more to read. Check again.` : found };
  } catch {
    return { ok: false, message: "Could not read the mailbox." };
  }
}

const Work = z.object({
  status: z.string(),
  assignee: z.union([z.literal(""), z.uuid()]),
  category: z.string().trim().max(60),
});

export async function saveConversation(id: string, _prev: SupportState, form: FormData): Promise<SupportState> {
  await requireStaff(SUPPORT_ROLES);
  const conversationId = z.uuid().safeParse(id);
  const parsed = Work.safeParse({
    status: form.get("status"),
    assignee: form.get("assignee") ?? "",
    category: form.get("category") ?? "",
  });
  if (!conversationId.success || !parsed.success) return { ok: false, message: "Check the fields and try again." };
  const status = parsed.data.status;
  if (!isSupportStatus(status)) return { ok: false, message: "Check the fields and try again." };

  const supabase = await createClient();
  if (parsed.data.assignee) {
    // Only someone who can open the support desk can hold a conversation.
    const { data: roles } = await supabase.from("profile_roles").select("role").eq("profile_id", parsed.data.assignee);
    if (!(roles ?? []).some((r) => (SUPPORT_ROLES as readonly string[]).includes(r.role))) {
      return { ok: false, message: "That person does not work the support desk." };
    }
  }
  const { data, error } = await supabase
    .from("support_conversations")
    .update({
      status,
      assignee_id: parsed.data.assignee || null,
      category: parsed.data.category || null,
    })
    .eq("id", conversationId.data)
    .select("id");
  if (error || !data?.length) return { ok: false, message: "Could not save. Try again." };
  revalidatePath("/support");
  revalidatePath(`/support/${conversationId.data}`);
  return { ok: true, message: "Saved." };
}

export async function takeConversation(id: string) {
  const viewer = await requireStaff(SUPPORT_ROLES);
  const conversationId = z.uuid().parse(id);
  const supabase = await createClient();
  await supabase.from("support_conversations").update({ assignee_id: viewer.id }).eq("id", conversationId);
  revalidatePath("/support");
  revalidatePath(`/support/${conversationId}`);
}

export async function addNote(id: string, _prev: SupportState, form: FormData): Promise<SupportState> {
  const viewer = await requireStaff(SUPPORT_ROLES);
  const conversationId = z.uuid().safeParse(id);
  const body = z.string().trim().min(1).max(5000).safeParse(form.get("body"));
  if (!conversationId.success || !body.success) return { ok: false, message: "Write a note first (5,000 characters at most)." };
  const supabase = await createClient();
  const { error } = await supabase.from("support_messages").insert({
    company_id: viewer.companyId,
    conversation_id: conversationId.data,
    direction: "note",
    author_id: viewer.id,
    body_text: body.data,
  });
  if (error) return { ok: false, message: "Could not save the note. Try again." };
  revalidatePath(`/support/${conversationId.data}`);
  return { ok: true, message: "Note added." };
}
