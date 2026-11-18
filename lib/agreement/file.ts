import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/dates";
import { buildAgreementPdf } from "./pdf";
import { asSections } from "./sections";

export const AGREEMENT_BUCKET = "agreements";

// Builds the signed agreement PDF from the stored records and files it in the
// private bucket. Server job (service role): the caller has already checked
// that the person may see this signature. Safe to call twice.
export async function fileAgreementPdf(signatureId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: sig, error } = await admin
    .from("agreement_signatures")
    .select("*, agreement_versions(version, title, sections), jobs(name, companies(name))")
    .eq("id", signatureId)
    .single();
  if (error || !sig) throw new Error("signature not found");
  if (sig.pdf_path) return sig.pdf_path;

  const { data: days } = await admin.from("photo_days").select("date").eq("job_id", sig.job_id).order("date");
  const version = sig.agreement_versions as { version: number; title: string; sections: unknown } | null;
  const job = sig.jobs as { name: string; companies: { name: string } | null } | null;

  const bytes = await buildAgreementPdf({
    companyName: job?.companies?.name ?? "",
    jobName: job?.name ?? "",
    photoDays: (days ?? []).map((d) => formatDate(d.date, { weekday: true })),
    version: version?.version ?? 0,
    title: version?.title ?? "Agreement",
    sections: asSections(version?.sections),
    signerName: sig.signer_name,
    signerEmail: sig.signer_email,
    initials: (sig.initials ?? {}) as Record<string, string>,
    signedAt: sig.signed_at,
    ipAddress: (sig.ip_address as string | null) ?? null,
    signatureId: sig.id,
  });

  const path = `${sig.company_id}/${sig.job_id}/${sig.id}.pdf`;
  const { error: uploadError } = await admin.storage
    .from(AGREEMENT_BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (uploadError) throw new Error(`could not store the PDF: ${uploadError.message}`);
  const { error: updateError } = await admin.from("agreement_signatures").update({ pdf_path: path }).eq("id", sig.id);
  if (updateError) throw new Error(`could not record the PDF: ${updateError.message}`);
  return path;
}

/** A five-minute download link, for someone who has already passed an RLS read. */
export async function agreementDownloadUrl(path: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(AGREEMENT_BUCKET).createSignedUrl(path, 300, { download: true });
  if (error || !data) throw new Error("could not make a download link");
  return data.signedUrl;
}
