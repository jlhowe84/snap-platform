"use server";

import { revalidatePath } from "next/cache";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseBlackout, parseScheduleForm } from "@/lib/makeups/form";
import { MAKEUP_SETTING, readSchedule, type Schedule } from "@/lib/makeups/schedule";

export type ScheduleState = { ok: boolean; message: string } | null;

// Owner and admin set when makeups and retakes can be booked. The schedule is
// one settings row, written as the signed-in person, so RLS has the last word.
async function load() {
  const viewer = await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("value").eq("key", MAKEUP_SETTING).maybeSingle();
  return { viewer, supabase, schedule: readSchedule(data?.value) };
}

async function save(supabase: Awaited<ReturnType<typeof createClient>>, companyId: string, userId: string, schedule: Schedule) {
  const { error } = await supabase
    .from("settings")
    .upsert({ company_id: companyId, key: MAKEUP_SETTING, value: schedule as never, updated_by: userId }, { onConflict: "company_id,key" });
  revalidatePath("/settings/makeups");
  revalidatePath("/production/makeups");
  return !error;
}

const entries = (form: FormData) => Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v : undefined]));

export async function saveSchedule(_prev: ScheduleState, form: FormData): Promise<ScheduleState> {
  const { viewer, supabase, schedule } = await load();
  const parsed = parseScheduleForm(entries(form), schedule);
  if (!parsed.ok) return parsed;
  if (!(await save(supabase, viewer.companyId, viewer.id, parsed.value))) return { ok: false, message: "The schedule could not be saved." };
  return { ok: true, message: parsed.value.open ? "Saved. The booking page is open." : "Saved. The booking page is closed." };
}

export async function addBlackout(_prev: ScheduleState, form: FormData): Promise<ScheduleState> {
  const { viewer, supabase, schedule } = await load();
  const parsed = parseBlackout(entries(form), schedule.blackouts);
  if (!parsed.ok) return parsed;
  if (!(await save(supabase, viewer.companyId, viewer.id, { ...schedule, blackouts: parsed.value }))) return { ok: false, message: "That could not be saved." };
  return { ok: true, message: "Closed. Sessions already booked on those dates stay booked until you cancel them." };
}

export async function removeBlackout(from: string, to: string): Promise<void> {
  const { viewer, supabase, schedule } = await load();
  await save(supabase, viewer.companyId, viewer.id, { ...schedule, blackouts: schedule.blackouts.filter((b) => !(b.from === from && b.to === to)) });
}
