import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { PayLine } from "@/lib/staffing/pay";

export type LoadedLine = PayLine & { id: string; directions: string | null };

type Place = { location_name: string | null; address: string | null; city: string | null; state: string | null; zip: string | null };

/** A driving directions link from home to the photo day, when both are known. */
export function directionsHref(home: string | null | undefined, day: Place | null | undefined): string | null {
  if (!home || !day) return null;
  const dest = [day.address, day.city, [day.state, day.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") || day.location_name;
  if (!dest) return null;
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(home)}&destination=${encodeURIComponent(dest)}&travelmode=driving`;
}

/** Pay lines in a date range with each person's name. RLS limits this to owner and admin. */
export async function loadPayLines(from: string, to: string): Promise<{ lines: LoadedLine[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pay_lines")
    .select("id, crew_member_id, work_date, position, description, rate, unit, hours, base, miles, mileage, adjustment, total, status, note, crew_members(full_name), shifts(photo_days(location_name, address, city, state, zip))")
    .gte("work_date", from)
    .lte("work_date", to)
    .order("work_date")
    .limit(2000);
  const crewIds = [...new Set((data ?? []).map((l) => l.crew_member_id))];
  const { data: homes } = crewIds.length
    ? await supabase.from("crew_private").select("crew_member_id, address").in("crew_member_id", crewIds)
    : { data: [] };
  const homeOf = new Map((homes ?? []).map((h) => [h.crew_member_id, h.address]));
  const lines = (data ?? []).map((l) => ({
    id: l.id,
    directions: directionsHref(homeOf.get(l.crew_member_id), l.shifts?.photo_days ?? null),
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
