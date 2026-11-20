"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { ADMIN_ROLES, OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CREW_PHOTO_BUCKET } from "@/lib/staffing/photos";

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

// Home address and emergency contact. Owner and admin only.
export async function savePrivate(crewId: string, _prev: PayState, form: FormData): Promise<PayState> {
  const viewer = await requireStaff(ADMIN_ROLES);
  const crew = z.uuid().safeParse(crewId);
  const text = (max: number) => z.string().trim().max(max).transform((v) => v || null);
  const f = z
    .object({ address: text(300), emergency_name: text(120), emergency_phone: text(40) })
    .safeParse({ address: form.get("address") ?? "", emergency_name: form.get("emergency_name") ?? "", emergency_phone: form.get("emergency_phone") ?? "" });
  if (!crew.success || !f.success) return { ok: false, message: "Something is too long. Shorten it and save again." };
  if (f.data.address && f.data.address.length < 5) return { ok: false, message: "Enter the full home address." };
  const supabase = await createClient();
  const empty = !f.data.address && !f.data.emergency_name && !f.data.emergency_phone;
  const { error } = empty
    ? await supabase.from("crew_private").delete().eq("crew_member_id", crew.data)
    : await supabase.from("crew_private").upsert({ crew_member_id: crew.data, company_id: viewer.companyId!, ...f.data }, { onConflict: "crew_member_id" });
  if (error) return { ok: false, message: "Could not save. Try again." };
  revalidatePath(`/crew/${crew.data}`);
  return { ok: true, message: "Saved." };
}

const POSITIONS = ["photographer", "poser", "coordinator", "photo_attendant", "office"] as const;

// Contact details, positions, Level and notes. Owner, admin and office.
export async function saveCrewDetails(crewId: string | null, _prev: PayState, form: FormData): Promise<PayState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  const text = (max: number) => z.string().trim().max(max).transform((v) => v || null);
  const f = z
    .object({
      full_name: z.string().trim().min(1).max(120),
      email: z.union([z.literal(""), z.email().max(200)]).transform((v) => (v ? v.toLowerCase() : null)),
      phone: text(40),
      city: text(80),
      state: text(40),
      positions: z.array(z.enum(POSITIONS)).max(5),
      level: z.union([z.literal(""), z.coerce.number().int().min(1).max(5)]).transform((v) => (v === "" ? null : v)),
      active: z.boolean(),
      notes: text(4000),
    })
    .safeParse({
      full_name: form.get("full_name") ?? "",
      email: String(form.get("email") ?? "").trim(),
      phone: form.get("phone") ?? "",
      city: form.get("city") ?? "",
      state: form.get("state") ?? "",
      positions: form.getAll("positions"),
      level: String(form.get("level") ?? ""),
      active: form.get("active") === "on",
      notes: form.get("notes") ?? "",
    });
  if (!f.success) return { ok: false, message: "A name is needed, and the email has to be a real address." };
  const supabase = await createClient();
  if (crewId) {
    const crew = z.uuid().safeParse(crewId);
    if (!crew.success) return { ok: false, message: "That crew member was not found." };
    const { data, error } = await supabase.from("crew_members").update(f.data).eq("id", crew.data).select("id");
    if (error || !data?.length) return { ok: false, message: "Could not save. Try again." };
    revalidatePath(`/crew/${crew.data}`);
    revalidatePath("/crew");
    return { ok: true, message: "Saved." };
  }
  const { data, error } = await supabase
    .from("crew_members")
    .insert({ ...f.data, company_id: viewer.companyId! })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: "Could not add them. Try again." };
  revalidatePath("/crew");
  redirect(`/crew/${data.id}`);
}

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" };
const PHOTO_MAX = 8 * 1024 * 1024;

export type PhotoStart = { ok: true; path: string; token: string } | { ok: false; message: string };

/** A one-time upload link for a crew member's photo. */
export async function startCrewPhoto(crewId: string, file: { type: string; size: number }): Promise<PhotoStart> {
  const viewer = await requireStaff(OFFICE_ROLES);
  const crew = z.uuid().safeParse(crewId);
  const ext = PHOTO_TYPES[file.type];
  if (!crew.success || !viewer.companyId) return { ok: false, message: "That crew member was not found." };
  if (!ext) return { ok: false, message: "Use a JPG, PNG, WebP or HEIC photo." };
  if (file.size > PHOTO_MAX) return { ok: false, message: "That photo is over 8 MB." };
  const supabase = await createClient();
  const { data: c } = await supabase.from("crew_members").select("id").eq("id", crew.data).maybeSingle();
  if (!c) return { ok: false, message: "That crew member was not found." };
  const path = `${viewer.companyId}/${crew.data}/${randomUUID()}.${ext}`;
  const { data, error } = await createAdminClient().storage.from(CREW_PHOTO_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: "Could not start the upload. Try again." };
  return { ok: true, path, token: data.token };
}

/** Points the profile at the uploaded photo and removes the old one. */
export async function finishCrewPhoto(crewId: string, path: string): Promise<{ ok: boolean; message: string }> {
  const viewer = await requireStaff(OFFICE_ROLES);
  const crew = z.uuid().safeParse(crewId);
  if (!crew.success || !viewer.companyId || !path.startsWith(`${viewer.companyId}/${crew.data}/`)) {
    return { ok: false, message: "That upload did not match this person." };
  }
  const supabase = await createClient();
  const { data: c } = await supabase.from("crew_members").select("photo_path").eq("id", crew.data).maybeSingle();
  if (!c) return { ok: false, message: "That crew member was not found." };
  const { error } = await supabase.from("crew_members").update({ photo_path: path }).eq("id", crew.data);
  if (error) return { ok: false, message: "Could not save the photo. Try again." };
  if (c.photo_path && c.photo_path !== path) await createAdminClient().storage.from(CREW_PHOTO_BUCKET).remove([c.photo_path]);
  revalidatePath(`/crew/${crew.data}`);
  return { ok: true, message: "Photo saved." };
}

export async function removeCrewPhoto(crewId: string) {
  await requireStaff(OFFICE_ROLES);
  const crew = z.uuid().parse(crewId);
  const supabase = await createClient();
  const { data: c } = await supabase.from("crew_members").select("photo_path").eq("id", crew).maybeSingle();
  if (!c?.photo_path) return;
  await supabase.from("crew_members").update({ photo_path: null }).eq("id", crew);
  await createAdminClient().storage.from(CREW_PHOTO_BUCKET).remove([c.photo_path]);
  revalidatePath(`/crew/${crew}`);
}
