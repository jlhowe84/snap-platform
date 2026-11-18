"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff, ADMIN_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { asSections, parseSections } from "@/lib/agreement/sections";

export type DraftState = { ok: boolean; message: string } | null;

// Starts a new draft from the current text (or blank). Signed versions never
// change; edits always go into a new version.
export async function newDraft() {
  const viewer = await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();
  const { data: versions } = await supabase
    .from("agreement_versions")
    .select("version, title, sections, status")
    .order("version", { ascending: false });
  if (versions?.some((v) => v.status === "draft")) redirect("/settings/agreement");
  const base = versions?.find((v) => v.status === "active") ?? versions?.[0];
  await supabase.from("agreement_versions").insert({
    company_id: viewer.companyId,
    version: (versions?.[0]?.version ?? 0) + 1,
    title: base?.title ?? "Photo Day Agreement",
    sections: asSections(base?.sections),
    status: "draft",
    created_by: viewer.id,
  });
  revalidatePath("/settings/agreement");
  redirect("/settings/agreement");
}

const Save = z.object({
  id: z.uuid(),
  title: z.string().trim().min(2).max(200),
  text: z.string().max(100_000),
});

export async function saveDraft(_prev: DraftState, form: FormData): Promise<DraftState> {
  await requireStaff(ADMIN_ROLES);
  const parsed = Save.safeParse({ id: form.get("id"), title: form.get("title"), text: form.get("text") });
  if (!parsed.success) return { ok: false, message: "Give the agreement a title." };
  const sections = parseSections(parsed.data.text);
  if (!sections.length) return { ok: false, message: 'Add at least one section, starting with a "## Title" line.' };

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("agreement_versions")
    .update({ title: parsed.data.title, sections }, { count: "exact" })
    .eq("id", parsed.data.id)
    .eq("status", "draft");
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "Only a draft can be edited." };
  revalidatePath("/settings/agreement");
  const initials = sections.filter((s) => s.initial).length;
  return { ok: true, message: `Saved ${sections.length} sections (${initials} need initials).` };
}

// Makes the draft the version coordinators sign. The old active version is
// retired, and stays attached to everything signed under it.
export async function activateDraft(id: string) {
  await requireStaff(ADMIN_ROLES);
  const draftId = z.uuid().parse(id);
  const supabase = await createClient();
  const { data: draft } = await supabase.from("agreement_versions").select("sections").eq("id", draftId).eq("status", "draft").maybeSingle();
  if (!draft || !asSections(draft.sections).length) redirect("/settings/agreement");
  await supabase.from("agreement_versions").update({ status: "retired" }).eq("status", "active");
  await supabase
    .from("agreement_versions")
    .update({ status: "active", activated_at: new Date().toISOString() })
    .eq("id", draftId);
  revalidatePath("/settings/agreement");
  redirect("/settings/agreement");
}
