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

export type CapturaTestState = { ok: boolean; message: string } | null;

// One read-only call to Captura (the first gallery in the account) to prove
// the stored credentials work. Records the outcome on integration_status.
// Never prints credentials; errors carry only the HTTP status.
export async function testCapturaConnection(): Promise<CapturaTestState> {
  const viewer = await requireStaff(ADMIN_ROLES);
  const { loadCapturaCredentials, createCapturaClient } = await import("@/lib/captura/client");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const now = new Date().toISOString();

  let result: CapturaTestState;
  try {
    const creds = await loadCapturaCredentials(viewer.companyId);
    if (!creds) {
      result = { ok: false, message: "No Captura credentials are stored yet." };
    } else {
      const page = await createCapturaClient(creds).listGalleries({ start: 0, end: 1 });
      const count = Array.isArray(page) ? page.length : Array.isArray((page as { data?: unknown[] })?.data) ? (page as { data: unknown[] }).data.length : null;
      await admin.from("integration_status").upsert({
        company_id: viewer.companyId,
        integration: "captura",
        enabled: true,
        last_success_at: now,
        last_error: null,
        details: { test: "list galleries", returned: count },
      });
      result = { ok: true, message: "Captura answered. The connection works (read-only)." };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    await admin.from("integration_status").upsert({
      company_id: viewer.companyId,
      integration: "captura",
      last_error_at: now,
      last_error: message,
    });
    result = { ok: false, message };
  }
  revalidatePath("/settings");
  return result;
}
