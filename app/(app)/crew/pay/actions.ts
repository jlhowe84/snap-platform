"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Payroll. Owner and admin only, and RLS says the same. A paid line is final.

export type PayRunState = { ok: boolean; message: string } | null;

const day = z.iso.date();
const Range = z.object({ from: day, to: day }).refine((r) => r.from <= r.to);

export async function addPayLines(_prev: PayRunState, form: FormData): Promise<PayRunState> {
  await requireStaff(ADMIN_ROLES);
  const r = Range.safeParse({ from: form.get("from"), to: form.get("to") });
  if (!r.success) return { ok: false, message: "Choose a start and end date." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_pay_lines", { p_from: r.data.from, p_to: r.data.to });
  if (error) return { ok: false, message: "Pay could not be added." };
  revalidatePath("/crew/pay");
  return { ok: true, message: data ? `Added ${data} pay line${data === 1 ? "" : "s"}.` : "Every shift worked in these dates already has pay." };
}

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const Line = z.object({
  miles: z.coerce.number().min(0).max(9999),
  hours: z.preprocess(blank, z.coerce.number().min(0).max(24).optional()),
  adjustment: z.coerce.number().min(-10000).max(10000),
  note: z.string().trim().max(500),
});

export async function savePayLine(lineId: string, form: FormData) {
  await requireStaff(ADMIN_ROLES);
  const id = z.uuid().parse(lineId);
  const l = Line.safeParse({ miles: form.get("miles") || 0, hours: form.get("hours"), adjustment: form.get("adjustment") || 0, note: form.get("note") ?? "" });
  if (!l.success) return;
  const supabase = await createClient();
  const { data: cur } = await supabase.from("pay_lines").select("rate, unit").eq("id", id).maybeSingle();
  if (!cur) return;
  const patch: { miles: number; adjustment: number; note: string | null; hours?: number; base?: number } = {
    miles: l.data.miles,
    adjustment: Math.round(l.data.adjustment * 100) / 100,
    note: l.data.note || null,
  };
  if (cur.unit === "hour" && l.data.hours !== undefined && cur.rate != null) {
    patch.hours = l.data.hours;
    patch.base = Math.round(Number(cur.rate) * l.data.hours * 100) / 100;
  }
  await supabase.from("pay_lines").update(patch).eq("id", id).neq("status", "paid");
  revalidatePath("/crew/pay");
}

export async function setPayStatus(from: string, to: string, status: "approved" | "paid") {
  await requireStaff(ADMIN_ROLES);
  const r = Range.parse({ from, to });
  const supabase = await createClient();
  await supabase
    .from("pay_lines")
    .update({ status })
    .gte("work_date", r.from)
    .lte("work_date", r.to)
    .eq("status", status === "approved" ? "pending" : "approved");
  revalidatePath("/crew/pay");
}

export async function removePayLine(lineId: string) {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();
  await supabase.from("pay_lines").delete().eq("id", z.uuid().parse(lineId)).eq("status", "pending");
  revalidatePath("/crew/pay");
}
