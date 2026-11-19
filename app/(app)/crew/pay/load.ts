import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { PayLine } from "@/lib/staffing/pay";

export type LoadedLine = PayLine & { id: string };

/** Pay lines in a date range with each person's name. RLS limits this to owner and admin. */
export async function loadPayLines(from: string, to: string): Promise<{ lines: LoadedLine[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pay_lines")
    .select("id, crew_member_id, work_date, position, description, rate, unit, hours, base, miles, mileage, adjustment, total, status, note, crew_members(full_name)")
    .gte("work_date", from)
    .lte("work_date", to)
    .order("work_date")
    .limit(2000);
  const lines = (data ?? []).map((l) => ({
    id: l.id,
    crew_member_id: l.crew_member_id,
    full_name: l.crew_members?.full_name ?? "Unknown",
    work_date: l.work_date,
    position: l.position,
    description: l.description,
    rate: l.rate == null ? null : Number(l.rate),
    unit: l.unit,
    hours: l.hours == null ? null : Number(l.hours),
    base: Number(l.base),
    miles: Number(l.miles),
    mileage: Number(l.mileage),
    adjustment: Number(l.adjustment),
    total: Number(l.total),
    status: l.status,
    note: l.note,
  }));
  return { lines, error: error?.message ?? null };
}
