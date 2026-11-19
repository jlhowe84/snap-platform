"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Pay rates. Owner and admin only (spec: see and edit pay rates and payroll);
// RLS refuses everyone else, and pay is kept out of the activity log.

export type PayState = { ok: boolean; message: string } | null;

const Rate = z.object({
  position: z.enum(["photographer", "poser", "coordinator", "photo_attendant", "office"]),
  amount: z.coerce.number().min(0).max(100000),
  unit: z.enum(["shift", "hour"]),
});

export async function savePayRate(crewId: string, _prev: PayState, form: FormData): Promise<PayState> {
  const viewer = await requireStaff(ADMIN_ROLES);
  const crew = z.uuid().safeParse(crewId);
  const r = Rate.safeParse({ position: form.get("position"), amount: form.get("amount"), unit: form.get("unit") });
  if (!crew.success || !r.success) return { ok: false, message: "Enter an amount for a position." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("pay_rates")
    .upsert(
      { company_id: viewer.companyId, crew_member_id: crew.data, position: r.data.position, amount: Math.round(r.data.amount * 100) / 100, unit: r.data.unit },
      { onConflict: "crew_member_id,position" },
    );
  if (error) return { ok: false, message: "The rate could not be saved." };
  revalidatePath(`/crew/${crew.data}`);
  return { ok: true, message: "Saved." };
}

export async function removePayRate(crewId: string, rateId: string) {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();
  await supabase.from("pay_rates").delete().eq("id", z.uuid().parse(rateId));
  revalidatePath(`/crew/${z.uuid().parse(crewId)}`);
}

// A crew member's home address, for mileage. Owner and admin only.
export async function saveHome(crewId: string, form: FormData) {
  const viewer = await requireStaff(ADMIN_ROLES);
  const crew = z.uuid().parse(crewId);
  const address = z.string().trim().max(300).parse(form.get("address") ?? "");
  const supabase = await createClient();
  if (address.length < 5) {
    await supabase.from("crew_homes").delete().eq("crew_member_id", crew);
  } else {
    await supabase.from("crew_homes").upsert({ crew_member_id: crew, company_id: viewer.companyId!, address }, { onConflict: "crew_member_id" });
  }
  revalidatePath(`/crew/${crew}`);
}
