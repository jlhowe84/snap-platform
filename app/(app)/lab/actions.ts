"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Lab invoices. The server reads them from the lab's emails; a person can
// ask for a check now and say which job a lab job name belongs to.

export type LabState = { ok: boolean; message: string } | null;

/** Looks for new invoice emails now. Reads Gmail, adds PDFs to the Drive folder. */
export async function checkInvoices(): Promise<LabState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  const { runLabInvoiceSync } = await import("@/lib/lab/sync");
  try {
    const results = await runLabInvoiceSync(viewer.companyId);
    revalidatePath("/lab");
    if (results.length === 0) return { ok: false, message: "Invoice pickup is not set up yet: it needs a mailbox and the lab's sender." };
    const failed = results.find((r) => r.error);
    if (failed) return { ok: false, message: failed.error! };
    const stored = results.reduce((n, r) => n + r.stored, 0);
    const unread = results.reduce((n, r) => n + r.unread, 0);
    const parts = [stored === 0 ? "No new invoices." : `${stored} new ${stored === 1 ? "invoice" : "invoices"} filed.`];
    if (unread > 0) parts.push(`${unread} ${unread === 1 ? "email" : "emails"} could not be read.`);
    if (results.some((r) => r.partial)) parts.push("There are more to read. Check again.");
    return { ok: true, message: parts.join(" ") };
  } catch {
    return { ok: false, message: "The invoices could not be checked." };
  }
}

const Match = z.object({ reference: z.string().trim().min(1).max(300), job: z.union([z.literal(""), z.uuid()]) });

/** Ties every invoice with this lab job name to a job, or clears the tie. */
export async function matchReference(_prev: LabState, form: FormData): Promise<LabState> {
  await requireStaff(OFFICE_ROLES);
  const parsed = Match.safeParse({ reference: form.get("reference"), job: form.get("job") ?? "" });
  if (!parsed.success) return { ok: false, message: "Pick a job." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lab_assign_reference", {
    p_reference: parsed.data.reference,
    p_job: (parsed.data.job || null) as unknown as string,
  });
  if (error) return { ok: false, message: "The match could not be saved." };
  revalidatePath("/lab");
  revalidatePath("/lab/invoices");
  return { ok: true, message: parsed.data.job ? `Matched ${data ?? 0} ${data === 1 ? "invoice" : "invoices"}.` : "Match cleared." };
}
