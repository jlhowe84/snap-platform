"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { newHelperKey } from "@/lib/helper/evidence";

export type HelperKeyState = { ok: true; key: string; name: string } | { ok: false; message: string } | null;

// Connects a computer: makes its key, stores only the hash, and shows the key
// once. The key goes into that computer's Keychain during setup.
export async function connectHelper(_prev: HelperKeyState, form: FormData): Promise<HelperKeyState> {
  const viewer = await requireStaff(ADMIN_ROLES);
  const name = z.string().trim().min(1).max(100).safeParse(form.get("name") ?? "");
  if (!viewer.companyId || !name.success) return { ok: false, message: "Name the computer, for example Production iMac." };
  const { key, hash } = newHelperKey();
  const supabase = await createClient();
  const { error } = await supabase.from("helper_devices").insert({ company_id: viewer.companyId, name: name.data, token_hash: hash, created_by: viewer.id });
  if (error) return { ok: false, message: "The computer could not be connected." };
  revalidatePath("/settings");
  return { ok: true, key, name: name.data };
}

export async function disconnectHelper(id: string): Promise<void> {
  await requireStaff(ADMIN_ROLES);
  if (!z.uuid().safeParse(id).success) return;
  const supabase = await createClient();
  await supabase.from("helper_devices").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null);
  revalidatePath("/settings");
}
