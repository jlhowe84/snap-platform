"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type NewState = { ok: boolean; message: string } | null;

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opt = (max: number) => z.preprocess(blank, z.string().trim().max(max).optional());

const League = z.object({
  name: z.string().trim().min(2).max(160),
  org_type: z.enum(["league", "club", "swim_team", "school", "single_team", "other"]),
  sports: opt(200),
  website: opt(300),
  contact_name: opt(160),
  contact_email: z.preprocess(blank, z.email().max(200).optional()),
  contact_phone: opt(40),
});

// Writes run as the signed-in person, so RLS decides (office roles only).
export async function createLeague(_prev: NewState, form: FormData): Promise<NewState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  const parsed = League.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) return { ok: false, message: "Give the league a name, and check the contact's email address." };
  const d = parsed.data;
  if ((d.contact_email || d.contact_phone) && !d.contact_name) return { ok: false, message: "Add the contact's name too." };

  const supabase = await createClient();
  const { data: same } = await supabase.from("organizations").select("id").ilike("name", d.name.replace(/[%_\\]/g, "\\$&")).limit(1);
  if (same?.length) return { ok: false, message: "A league with that name already exists. Open it from the Leagues list." };

  const { data: org, error } = await supabase
    .from("organizations")
    .insert({
      company_id: viewer.companyId,
      name: d.name,
      org_type: d.org_type,
      sports: (d.sports ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10),
      website: d.website ?? null,
    })
    .select("id")
    .single();
  if (error || !org) return { ok: false, message: "The league could not be added." };

  if (d.contact_name) {
    const { data: contact } = await supabase
      .from("contacts")
      .insert({ company_id: viewer.companyId, full_name: d.contact_name, email: d.contact_email ?? null, phone: d.contact_phone ?? null })
      .select("id")
      .single();
    if (contact) {
      await supabase
        .from("organization_contacts")
        .insert({ company_id: viewer.companyId, org_id: org.id, contact_id: contact.id, is_primary: true, role: "coordinator" });
    }
  }
  revalidatePath("/leagues");
  redirect(`/leagues/${org.id}`);
}
