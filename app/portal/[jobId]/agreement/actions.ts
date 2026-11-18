"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePortalViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type SignState = { ok: boolean; message: string } | null;

const Ids = z.object({ jobId: z.uuid(), versionId: z.uuid() });

// The database does every check (coordinator of this job, active version,
// every initial present, not signed before) and confirms the hold. The PDF is
// filed right after; if that fails, the download link files it on first use.
export async function signAgreement(jobId: string, versionId: string, _prev: SignState, form: FormData): Promise<SignState> {
  await requirePortalViewer();
  const ids = Ids.safeParse({ jobId, versionId });
  if (!ids.success) return { ok: false, message: "This page is out of date. Reload it and try again." };
  if (form.get("agree") !== "on") return { ok: false, message: "Tick the box to agree before signing." };

  const initials: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith("initial_") && typeof value === "string") {
      initials[key.slice("initial_".length)] = value.trim().toUpperCase().slice(0, 5);
    }
  }
  const name = String(form.get("signer_name") ?? "").trim().slice(0, 200);

  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded && /^[0-9a-fA-F:.]+$/.test(forwarded) ? forwarded : null;

  const supabase = await createClient();
  const { data: signatureId, error } = await supabase.rpc("sign_agreement", {
    p_job_id: ids.data.jobId,
    p_version_id: ids.data.versionId,
    p_signer_name: name,
    p_initials: initials,
    p_ip: ip ?? undefined,
    p_user_agent: h.get("user-agent")?.slice(0, 500) ?? undefined,
  });
  if (error || !signatureId) return { ok: false, message: error?.message ?? "Signing failed. Try again." };

  try {
    const { fileAgreementPdf } = await import("@/lib/agreement/file");
    await fileAgreementPdf(signatureId);
  } catch {
    // Filed lazily by the download route instead.
  }

  revalidatePath(`/portal/${ids.data.jobId}`);
  redirect(`/portal/${ids.data.jobId}/agreement`);
}
