"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, ADMIN_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const InviteSchema = z.object({
  email: z.email().transform((e) => e.trim().toLowerCase()),
  roles: z.array(z.enum(["admin", "office", "support", "crew"])).min(1),
});

export type InviteState = { ok: boolean; message: string } | null;

// Admins invite staff. The database refuses an admin granting owner or admin,
// so this form only offers the roles an admin may give.
export async function inviteStaff(_prev: InviteState, form: FormData): Promise<InviteState> {
  const viewer = await requireStaff(ADMIN_ROLES);
  const parsed = InviteSchema.safeParse({ email: form.get("email"), roles: form.getAll("roles") });
  if (!parsed.success) return { ok: false, message: "Enter an email and pick at least one role." };

  const supabase = await createClient();
  const { error } = await supabase.from("staff_invites").insert({
    company_id: viewer.companyId,
    email: parsed.data.email,
    roles: parsed.data.roles,
    invited_by: viewer.id,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/settings");
  return { ok: true, message: `Invited ${parsed.data.email}. They can sign in with Google now.` };
}
