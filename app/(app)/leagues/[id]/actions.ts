"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, OFFICE_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type TermsState = { ok: boolean; message: string } | null;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const Terms = z.object({
  orgId: z.uuid(),
  sponsorship: text(2000),
  rebate: text(2000),
  parent_discount: text(2000),
  other_terms: text(4000),
});

// League-specific money terms. They are a record for staff: nothing here
// pays, discounts or changes a price. Those stay on the never list.
export async function saveMoneyTerms(orgId: string, _prev: TermsState, form: FormData): Promise<TermsState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  const parsed = Terms.safeParse({
    orgId,
    sponsorship: form.get("sponsorship") ?? "",
    rebate: form.get("rebate") ?? "",
    parent_discount: form.get("parent_discount") ?? "",
    other_terms: form.get("other_terms") ?? "",
  });
  if (!parsed.success || !viewer.companyId) return { ok: false, message: "One of the fields is too long." };
  const { orgId: id, ...terms } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("organization_terms")
    .upsert({ org_id: id, company_id: viewer.companyId, ...terms, terms_updated_by: viewer.id }, { onConflict: "org_id" });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/leagues/${id}`);
  return { ok: true, message: "Saved. These show on this league's job pages." };
}
