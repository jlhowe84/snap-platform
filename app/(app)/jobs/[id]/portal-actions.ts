"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, OFFICE_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { newPortalToken, portalLinkExpiry } from "@/lib/portal/token";

export type PortalLinkState = { ok: true; url: string; contact: string } | { ok: false; message: string } | null;

const Create = z.object({ jobId: z.uuid(), contactId: z.uuid() });

// Mints a portal link for one of the job's contacts. The token is shown once,
// here; only its hash is stored. Nothing is emailed: in the prototype the
// office copies the link (mail stays in test mode).
export async function createPortalLink(jobId: string, _prev: PortalLinkState, form: FormData): Promise<PortalLinkState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  const parsed = Create.safeParse({ jobId, contactId: form.get("contact_id") });
  if (!parsed.success) return { ok: false, message: "Pick a contact." };

  const supabase = await createClient();
  const { data: contact } = await supabase
    .from("job_contacts")
    .select("contacts(id, full_name, email)")
    .eq("job_id", parsed.data.jobId)
    .eq("contact_id", parsed.data.contactId)
    .maybeSingle();
  const c = contact?.contacts as { id: string; full_name: string; email: string | null } | null;
  if (!c?.email) return { ok: false, message: "That contact has no email address, so the link could not sign them in." };

  const { data: days } = await supabase
    .from("photo_days")
    .select("date")
    .eq("job_id", parsed.data.jobId)
    .order("date", { ascending: false })
    .limit(1);

  const { token, hash } = newPortalToken();
  const { error } = await supabase.from("portal_links").insert({
    company_id: viewer.companyId,
    job_id: parsed.data.jobId,
    contact_id: c.id,
    token_hash: hash,
    expires_at: portalLinkExpiry(days?.[0]?.date).toISOString(),
    created_by: viewer.id,
  });
  if (error) return { ok: false, message: error.message };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  revalidatePath(`/jobs/${parsed.data.jobId}`);
  return { ok: true, url: `${proto}://${host}/p/${token}`, contact: c.full_name };
}

export async function revokePortalLink(jobId: string, linkId: string) {
  await requireStaff(OFFICE_ROLES);
  const ids = z.object({ jobId: z.uuid(), linkId: z.uuid() }).parse({ jobId, linkId });
  const supabase = await createClient();
  await supabase.from("portal_links").update({ revoked_at: new Date().toISOString() }).eq("id", ids.linkId).is("revoked_at", null);
  revalidatePath(`/jobs/${ids.jobId}`);
}
