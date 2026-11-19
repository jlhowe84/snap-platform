"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Gear. Owner, admin and office keep it (John's job at SNAP); RLS says the
// same. A kit going out is a checkout on a photo day; the database refuses a
// kit on two photo days the same date and marks a kit that comes back short.

const id = z.uuid();
const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

function refreshDay(dayId?: string) {
  revalidatePath("/gear");
  if (dayId) {
    revalidatePath(`/staffing/${dayId}`);
    revalidatePath(`/field/${dayId}`);
  }
}

export async function setKitStatus(kitId: string, form: FormData) {
  await requireStaff(OFFICE_ROLES);
  const status = z.enum(["ready", "needs_service", "retired"]).safeParse(form.get("status"));
  const notes = z.string().trim().max(1000).safeParse(form.get("notes") ?? "");
  if (!status.success || !notes.success) return;
  const supabase = await createClient();
  await supabase.from("kits").update({ status: status.data, notes: notes.data || null }).eq("id", id.parse(kitId));
  refreshDay();
}

export async function addKit(form: FormData) {
  const viewer = await requireStaff(OFFICE_ROLES);
  const code = z.string().trim().regex(/^[A-Za-z0-9-]{1,10}$/).safeParse(form.get("code"));
  if (!code.success) return;
  const supabase = await createClient();
  await supabase.from("kits").insert({ company_id: viewer.companyId, code: code.data.toUpperCase(), name: `Kit ${code.data.toUpperCase()}` });
  refreshDay();
}

const Body = z.object({
  serial: z.string().trim().min(1).max(40),
  letter: z.preprocess(blank, z.string().trim().max(4).optional()),
  model: z.preprocess(blank, z.string().trim().max(60).optional()),
  kit_id: z.preprocess(blank, z.uuid().optional()),
});

export async function saveCameraBody(bodyId: string | null, form: FormData) {
  const viewer = await requireStaff(OFFICE_ROLES);
  const b = Body.safeParse({ serial: form.get("serial"), letter: form.get("letter"), model: form.get("model"), kit_id: form.get("kit_id") });
  if (!b.success) return;
  const row = { serial: b.data.serial, letter: b.data.letter?.toUpperCase() ?? null, model: b.data.model ?? null, kit_id: b.data.kit_id ?? null };
  const supabase = await createClient();
  if (bodyId) await supabase.from("camera_bodies").update(row).eq("id", id.parse(bodyId));
  else await supabase.from("camera_bodies").insert({ ...row, company_id: viewer.companyId });
  refreshDay();
}

export async function addChecklistItem(form: FormData) {
  const viewer = await requireStaff(OFFICE_ROLES);
  const item = z
    .object({ section: z.string().trim().min(1).max(100), name: z.string().trim().min(1).max(200), outdoor_only: z.boolean() })
    .safeParse({ section: form.get("section"), name: form.get("name"), outdoor_only: form.get("outdoor_only") === "on" });
  if (!item.success) return;
  const supabase = await createClient();
  const { data: last } = await supabase.from("kit_checklist_items").select("position").order("position", { ascending: false }).limit(1);
  await supabase.from("kit_checklist_items").insert({ ...item.data, company_id: viewer.companyId, position: (last?.[0]?.position ?? 0) + 10 });
  refreshDay();
}

export async function setChecklistItemActive(itemId: string, active: boolean) {
  await requireStaff(OFFICE_ROLES);
  const supabase = await createClient();
  await supabase.from("kit_checklist_items").update({ active }).eq("id", id.parse(itemId));
  refreshDay();
}

// ---- Kits on a photo day -------------------------------------------------

export async function addKitToDay(dayId: string, form: FormData) {
  const viewer = await requireStaff(OFFICE_ROLES);
  const day = id.parse(dayId);
  const kit = id.safeParse(form.get("kit_id"));
  const station = z.preprocess(blank, z.coerce.number().int().min(1).max(20).optional()).safeParse(form.get("station"));
  if (!kit.success || !station.success) return;
  const supabase = await createClient();
  const { data: pd } = await supabase.from("photo_days").select("id, job_id").eq("id", day).maybeSingle();
  if (!pd) return;
  await supabase.from("kit_checkouts").insert({ company_id: viewer.companyId, job_id: pd.job_id, photo_day_id: pd.id, kit_id: kit.data, station: station.data ?? null });
  refreshDay(day);
}

export async function sendKitOut(dayId: string, checkoutId: string) {
  await requireStaff(OFFICE_ROLES);
  const supabase = await createClient();
  await supabase.from("kit_checkouts").update({ status: "out" }).eq("id", id.parse(checkoutId)).eq("status", "planned");
  refreshDay(id.parse(dayId));
}

export async function checkKitIn(dayId: string, checkoutId: string, form: FormData) {
  await requireStaff(OFFICE_ROLES);
  const missing = form.getAll("missing").map(String).filter((m) => m.length <= 200).slice(0, 100);
  const issues = z.string().trim().max(2000).safeParse(form.get("issues") ?? "");
  if (!issues.success) return;
  const supabase = await createClient();
  await supabase
    .from("kit_checkouts")
    .update({ status: "back", missing, issues: issues.data || null })
    .eq("id", id.parse(checkoutId))
    .eq("status", "out");
  refreshDay(id.parse(dayId));
}

export async function removeKitFromDay(dayId: string, checkoutId: string) {
  await requireStaff(OFFICE_ROLES);
  const supabase = await createClient();
  await supabase.from("kit_checkouts").delete().eq("id", id.parse(checkoutId)).eq("status", "planned");
  refreshDay(id.parse(dayId));
}
