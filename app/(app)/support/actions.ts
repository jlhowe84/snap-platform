"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SUPPORT_ROLES, isSupportStatus } from "@/lib/support/labels";
import { unfilledNotes } from "@/lib/support/saved";

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

const AFTER = ["waiting_customer", "open", "closed"] as const;

/**
 * Sends a reply to the customer from the conversation's mailbox. While test
 * mode is on it goes to the test address only and is kept as a note.
 */
export async function sendReply(id: string, _prev: SupportState, form: FormData): Promise<SupportState> {
  const viewer = await requireStaff(SUPPORT_ROLES);
  const conversationId = z.uuid().safeParse(id);
  const body = z.string().trim().min(1).max(20000).safeParse(form.get("body"));
  const after = z.enum(AFTER).safeParse(form.get("after") ?? "waiting_customer");
  if (!conversationId.success || !body.success || !after.success) {
    return { ok: false, message: "Write a reply first (20,000 characters at most)." };
  }
  // A note left for the person to fill in must never reach a customer.
  const notes = unfilledNotes(body.data);
  if (notes.length > 0) {
    return { ok: false, message: `Not sent. Fill in or remove ${notes.join(", ")} first.` };
  }
  // RLS decides whether this person can see the conversation at all.
  const supabase = await createClient();
  const { data: mine } = await supabase.from("support_conversations").select("id").eq("id", conversationId.data).maybeSingle();
  if (!mine) return { ok: false, message: "That conversation was not found." };

  const { sendSupportReply } = await import("@/lib/mail/reply");
  const result = await sendSupportReply({
    companyId: viewer.companyId,
    authorId: viewer.id,
    conversationId: conversationId.data,
    body: body.data,
  });
  revalidatePath(`/support/${conversationId.data}`);
  if (!result.ok) return result;
  if (result.testMode) {
    return { ok: true, message: `Test mode is on, so this went only to ${result.sentTo.join(", ")}. The customer did not get it.` };
  }
  await supabase.from("support_conversations").update({ status: after.data }).eq("id", conversationId.data);
  revalidatePath("/support");
  return { ok: true, message: "Reply sent." };
}

export type DraftState = { ok: true; draft: string; found: string[] } | { ok: false; message: string };

/** Writes a suggested reply for the reply box. Nothing is sent or saved. */
export async function draftReply(id: string): Promise<DraftState> {
  const viewer = await requireStaff(SUPPORT_ROLES);
  const conversationId = z.uuid().safeParse(id);
  if (!conversationId.success) return { ok: false, message: "That conversation was not found." };
  const { draftSupportReply } = await import("@/lib/support/draft");
  return draftSupportReply(viewer, conversationId.data);
}

const Saved = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(10000),
  category: z.string().trim().max(60),
});

export async function saveSavedReply(id: string | null, _prev: SupportState, form: FormData): Promise<SupportState> {
  const viewer = await requireStaff(SUPPORT_ROLES);
  const parsed = Saved.safeParse({ title: form.get("title"), body: form.get("body"), category: form.get("category") ?? "" });
  if (!parsed.success) return { ok: false, message: "A saved reply needs a title and some text." };
  const row = { title: parsed.data.title, body: parsed.data.body, category: parsed.data.category || null };
  const supabase = await createClient();
  if (id) {
    const replyId = z.uuid().safeParse(id);
    if (!replyId.success) return { ok: false, message: "That saved reply was not found." };
    const { data, error } = await supabase.from("support_saved_replies").update(row).eq("id", replyId.data).select("id");
    if (error || !data?.length) return { ok: false, message: "Could not save. Try again." };
  } else {
    const { error } = await supabase.from("support_saved_replies").insert({ ...row, company_id: viewer.companyId, created_by: viewer.id });
    if (error) return { ok: false, message: "Could not save. Try again." };
  }
  revalidatePath("/support/replies");
  return { ok: true, message: "Saved." };
}

export async function setSavedReplyActive(id: string, active: boolean) {
  await requireStaff(SUPPORT_ROLES);
  const replyId = z.uuid().parse(id);
  const supabase = await createClient();
  await supabase.from("support_saved_replies").update({ active }).eq("id", replyId);
  revalidatePath("/support/replies");
}
