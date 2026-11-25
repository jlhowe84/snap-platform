"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, ADMIN_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { chaseOrderProblem, EDITABLE_KEYS } from "@/lib/settings/editable";

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

// Owner and admin change the roles a team member holds. The rows are written
// as the signed-in person, so RLS has the last word on who may grant what.
export async function saveRoles(profileId: string, _prev: InviteState, form: FormData): Promise<InviteState> {
  const viewer = await requireStaff(ADMIN_ROLES);
  if (!viewer.companyId || !z.uuid().safeParse(profileId).success) return { ok: false, message: "That person was not found." };
  const { roleChange } = await import("@/lib/team/roles");
  const supabase = await createClient();
  const { data: rows } = await supabase.from("profile_roles").select("role").eq("profile_id", profileId).eq("company_id", viewer.companyId);
  const current = (rows ?? []).map((r) => r.role);
  if (!current.some((r) => r !== "coordinator")) return { ok: false, message: "That person was not found." };
  const change = roleChange({ viewerRoles: viewer.roles, self: profileId === viewer.id, current, wanted: form.getAll("roles").map(String) });
  if ("problem" in change) return { ok: false, message: change.problem };
  if (!change.add.length && !change.remove.length) return { ok: true, message: "Nothing changed." };

  // Add before removing, so a failure never leaves the person with less than they had.
  if (change.add.length) {
    const { error } = await supabase
      .from("profile_roles")
      .insert(change.add.map((role) => ({ profile_id: profileId, company_id: viewer.companyId!, role, granted_by: viewer.id })));
    if (error) return { ok: false, message: "The roles could not be saved." };
  }
  if (change.remove.length) {
    const { error } = await supabase.from("profile_roles").delete().eq("profile_id", profileId).eq("company_id", viewer.companyId).in("role", change.remove);
    if (error) return { ok: false, message: "The new roles were added, but the old ones could not be removed." };
  }
  revalidatePath("/settings");
  return { ok: true, message: "Roles saved." };
}

export type CapturaTestState ={ ok: boolean; message: string } | null;

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
      const page = await createCapturaClient(creds).listGalleries({ start: 1, end: 1 });
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

export type GmailTestState = { ok: boolean; message: string } | null;

// Signs in as each allowed mailbox and reads its profile (address and message
// count, no message content). Records the outcome on integration_status.
export async function testGmailConnection(): Promise<GmailTestState> {
  const viewer = await requireStaff(ADMIN_ROLES);
  const { loadServiceAccount, allowedMailboxes, createGmailClient } = await import("@/lib/gmail/client");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const now = new Date().toISOString();

  let result: GmailTestState;
  try {
    const sa = await loadServiceAccount(viewer.companyId);
    const { data: rows } = await admin
      .from("settings")
      .select("key, value")
      .eq("company_id", viewer.companyId)
      .eq("key", "mail.mailboxes");
    const boxes = allowedMailboxes(rows ?? []);
    if (!sa) {
      result = { ok: false, message: "No Workspace key is stored yet." };
    } else if (!boxes.length) {
      result = { ok: false, message: "No mailboxes are listed in mail.mailboxes." };
    } else {
      const seen: string[] = [];
      for (const box of boxes) {
        const p = await createGmailClient(sa, box, boxes).profile();
        seen.push(`${p.emailAddress} (${p.messagesTotal.toLocaleString("en-US")} messages)`);
      }
      await admin.from("integration_status").upsert({
        company_id: viewer.companyId,
        integration: "gmail",
        enabled: true,
        last_success_at: now,
        last_error: null,
        details: { test: "profile", mailboxes: boxes.length },
      });
      result = { ok: true, message: `Gmail answered for ${seen.join(", ")}. Read-only check.` };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    await admin.from("integration_status").upsert({
      company_id: viewer.companyId,
      integration: "gmail",
      last_error_at: now,
      last_error: message,
    });
    result = { ok: false, message };
  }
  revalidatePath("/settings");
  return result;
}

export type SettingsState = { ok: boolean; message: string } | null;

// Owner and admin change the numbers the platform plans by. Only the keys in
// lib/settings/editable.ts are accepted, each inside its own range; the row is
// written as the signed-in person, so RLS has the last word.
export async function saveCompanySettings(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const viewer = await requireStaff(ADMIN_ROLES);
  if (!viewer.companyId) return { ok: false, message: "No company on this account." };
  const values: Record<string, number> = {};
  for (const [key, spec] of EDITABLE_KEYS) {
    const n = z.coerce.number().int().min(spec.min).max(spec.max).safeParse(form.get(key));
    if (!n.success) return { ok: false, message: `${spec.label} must be a whole number from ${spec.min} to ${spec.max}.` };
    values[key] = n.data;
  }
  const problem = chaseOrderProblem(values);
  if (problem) return { ok: false, message: problem };

  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .upsert(Object.entries(values).map(([key, value]) => ({ company_id: viewer.companyId!, key, value })), { onConflict: "company_id,key" });
  if (error) return { ok: false, message: "The settings could not be saved." };
  revalidatePath("/settings");
  return { ok: true, message: "Saved." };
}

export type DriveState = { ok: boolean; message: string } | null;

// The Drive folder the lab's invoice PDFs are filed in. An owner or admin
// pastes the folder's link; only its id is kept. The row is written as the
// signed-in person, so RLS has the last word.
export async function saveInvoiceFolder(_prev: DriveState, form: FormData): Promise<DriveState> {
  const viewer = await requireStaff(ADMIN_ROLES);
  if (!viewer.companyId) return { ok: false, message: "No company on this account." };
  const { folderIdFrom } = await import("@/lib/drive/client");
  const id = folderIdFrom(String(form.get("folder") ?? ""));
  if (!id) return { ok: false, message: "Paste the folder's link from Google Drive." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .upsert({ company_id: viewer.companyId, key: "lab.invoice_drive_folder", value: id }, { onConflict: "company_id,key" });
  if (error) return { ok: false, message: "The folder could not be saved." };
  revalidatePath("/settings");
  return { ok: true, message: "Saved. Use the test to make sure the platform can add files there." };
}

// Reads the shared folder's name and whether files may be added. Nothing is
// written to Drive and no file is opened.
export async function testDriveFolder(): Promise<DriveState> {
  const viewer = await requireStaff(ADMIN_ROLES);
  const { loadServiceAccount } = await import("@/lib/gmail/client");
  const { createDriveClient, driveProblem, folderIdFrom } = await import("@/lib/drive/client");
  const supabase = await createClient();
  const { data: row } = await supabase.from("settings").select("value").eq("key", "lab.invoice_drive_folder").maybeSingle();
  const id = typeof row?.value === "string" ? folderIdFrom(row.value) : null;
  if (!id) return { ok: false, message: "Save the folder's link first." };
  try {
    const sa = await loadServiceAccount(viewer.companyId!);
    if (!sa) return { ok: false, message: "No Workspace key is stored yet." };
    const folder = await createDriveClient(sa, id).root();
    if (folder.mimeType !== "application/vnd.google-apps.folder") return { ok: false, message: "That link is a file, not a folder." };
    if (folder.capabilities?.canAddChildren === false) {
      return { ok: false, message: `The platform can see "${folder.name}" but may not add files. Share it as Content manager.` };
    }
    return { ok: true, message: `The platform can add files to "${folder.name}".` };
  } catch (e) {
    return { ok: false, message: driveProblem(e) };
  }
}

// The number crew texts go to while texts are in test mode. Only a US mobile
// number is accepted; an empty box clears it, which holds every text.
export type TextNumberState = { ok: boolean; message: string } | null;

export async function saveTextTestNumber(_prev: TextNumberState, form: FormData): Promise<TextNumberState> {
  const viewer = await requireStaff(ADMIN_ROLES);
  if (!viewer.companyId) return { ok: false, message: "No company on this account." };
  const { toUsMobile, formatUsMobile } = await import("@/lib/sms/phone");
  const typed = String(form.get("number") ?? "").trim();
  const number = typed ? toUsMobile(typed) : null;
  if (typed && !number) return { ok: false, message: "Enter a US mobile number, area code first." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .upsert({ company_id: viewer.companyId, key: "sms.test_recipient", value: number }, { onConflict: "company_id,key" });
  if (error) return { ok: false, message: "The number could not be saved." };
  revalidatePath("/settings");
  return number
    ? { ok: true, message: `Saved. In test mode every crew text goes to ${formatUsMobile(number)}.` }
    : { ok: true, message: "Cleared. In test mode no text goes anywhere." };
}
