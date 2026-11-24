"use server";

import { revalidatePath } from "next/cache";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { messageDef, settingKeyOf, templateProblem } from "@/lib/messages/catalog";

export type MessageState = { ok: boolean; message: string } | null;

// Owner and admin change the wording of an email the platform writes. Each
// message is one settings row, written as the signed-in person, so RLS has
// the last word. Only messages in the catalog can be saved, and only with
// fields that message has. Who a message goes to is not set here.
async function write(key: string, value: { subject: string; body: string } | Record<string, never>): Promise<boolean> {
  const viewer = await requireStaff(ADMIN_ROLES);
  const def = messageDef(key);
  if (!def || !viewer.companyId) return false;
  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .upsert({ company_id: viewer.companyId, key: settingKeyOf(def), value, updated_by: viewer.id }, { onConflict: "company_id,key" });
  revalidatePath("/settings/messages");
  revalidatePath(`/settings/messages/${key}`);
  return !error;
}

export async function saveMessage(key: string, _prev: MessageState, form: FormData): Promise<MessageState> {
  const def = messageDef(key);
  if (!def) return { ok: false, message: "That message was not found." };
  const subject = String(form.get("subject") ?? "").trim();
  const body = String(form.get("body") ?? "").replace(/\r\n/g, "\n").trim();
  const problem = templateProblem(def, subject, body);
  if (problem) return { ok: false, message: problem };
  if (!(await write(key, { subject, body }))) return { ok: false, message: "The wording could not be saved." };
  return { ok: true, message: "Saved. The next one that goes out uses this wording." };
}

/** Back to the wording the platform started with. */
export async function resetMessage(key: string): Promise<MessageState> {
  if (!messageDef(key)) return { ok: false, message: "That message was not found." };
  if (!(await write(key, {}))) return { ok: false, message: "The wording could not be reset." };
  return { ok: true, message: "Back to the original wording." };
}
