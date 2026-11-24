import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashPortalToken, looksLikePortalToken } from "@/lib/portal/token";
import { addDays, MAKEUP_SETTING, readSchedule, slotKey, wallClock, type Schedule, type Taken, type WallClock } from "./schedule";

type Client = SupabaseClient<Database>;
type BookingInsert = Database["public"]["Tables"]["makeup_bookings"]["Insert"];
export type BookingRow = Database["public"]["Tables"]["makeup_bookings"]["Row"];

export type PublicCompany = { id: string; name: string; slug: string; timeZone: string };

// The public booking page has no signed-in person, so these reads and writes
// use the service role. Every one is scoped to the company in the address,
// and nothing a parent sends is trusted until it has been checked against
// the schedule (lib/makeups/schedule.ts).
export async function loadPublicSchedule(slug: string): Promise<{ company: PublicCompany; schedule: Schedule; now: WallClock } | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  const admin = createAdminClient();
  const { data: company } = await admin.from("companies").select("id, name, slug, time_zone").eq("slug", slug).maybeSingle();
  if (!company) return null;
  const { data: setting } = await admin.from("settings").select("value").eq("company_id", company.id).eq("key", MAKEUP_SETTING).maybeSingle();
  return {
    company: { id: company.id, name: company.name, slug: company.slug, timeZone: company.time_zone },
    schedule: readSchedule(setting?.value),
    now: wallClock(company.time_zone),
  };
}

/** How many bookings each time already holds, from a date on. Counts only, no names. */
export async function takenFrom(client: Client, companyId: string, from: string, days: number): Promise<Taken> {
  const { data } = await client
    .from("makeup_bookings")
    .select("date, start_time")
    .eq("company_id", companyId)
    .neq("status", "cancelled")
    .gte("date", from)
    .lte("date", addDays(from, days))
    .limit(5000);
  const taken: Taken = {};
  for (const b of data ?? []) {
    const key = slotKey(b.date, b.start_time);
    taken[key] = (taken[key] ?? 0) + 1;
  }
  return taken;
}

/**
 * Books a seat of a time. The unique index on (date, time, seat) is what
 * stops two people taking the same seat: each seat is tried in turn, and a
 * time with none left answers "full".
 */
export async function insertBooking(
  client: Client,
  row: Omit<BookingInsert, "seat">,
  perSlot: number,
): Promise<{ ok: true; booking: BookingRow } | { ok: false; full: boolean }> {
  for (let seat = 1; seat <= perSlot; seat++) {
    const { data, error } = await client.from("makeup_bookings").insert({ ...row, seat }).select("*").single();
    if (data) return { ok: true, booking: data };
    if (error?.code !== "23505") return { ok: false, full: false };
  }
  return { ok: false, full: true };
}

/** The booking a parent's own link opens, or null. */
export async function bookingByToken(token: string): Promise<{ booking: BookingRow; company: PublicCompany } | null> {
  if (!looksLikePortalToken(token)) return null;
  const admin = createAdminClient();
  const { data: booking } = await admin.from("makeup_bookings").select("*").eq("token_hash", hashPortalToken(token)).maybeSingle();
  if (!booking) return null;
  const { data: company } = await admin.from("companies").select("id, name, slug, time_zone").eq("id", booking.company_id).maybeSingle();
  if (!company) return null;
  return { booking, company: { id: company.id, name: company.name, slug: company.slug, timeZone: company.time_zone } };
}

export function factsOf(b: BookingRow) {
  return {
    kind: b.kind as "makeup" | "retake",
    player: b.player,
    league: b.league,
    team: b.team,
    date: b.date,
    time: b.start_time.slice(0, 5),
    parentName: b.parent_name,
    email: b.email,
    phone: b.phone,
    orderNumber: b.order_number,
    note: b.parent_note,
  };
}
