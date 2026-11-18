"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, OFFICE_ROLES, ADMIN_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSeasonLabel } from "@/lib/season";

export type BoardState = { ok: boolean; message: string } | null;

function done(message: string): BoardState {
  revalidatePath("/season");
  return { ok: true, message };
}

export async function buildBoard(season: string): Promise<BoardState> {
  await requireStaff(OFFICE_ROLES);
  if (!isSeasonLabel(season)) return { ok: false, message: "Unknown season." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("build_season_board", { p_season: season });
  if (error) return { ok: false, message: error.message };
  return done(data ? `Added ${data} returning league${data === 1 ? "" : "s"} and ranked the board.` : "No new leagues to add. The ranking is refreshed.");
}

const Hold = z.object({
  offerId: z.uuid(),
  date: z.iso.date(),
  stations: z.coerce.number().int().min(1).max(20),
  override: z.literal("on").optional(),
});

export async function holdDate(_prev: BoardState, form: FormData): Promise<BoardState> {
  await requireStaff(OFFICE_ROLES);
  const parsed = Hold.safeParse({
    offerId: form.get("offer_id"),
    date: form.get("date"),
    stations: form.get("stations"),
    override: form.get("override") ?? undefined,
  });
  if (!parsed.success) return { ok: false, message: "Pick a date and the number of stations." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("hold_date", {
    p_offer_id: parsed.data.offerId,
    p_date: parsed.data.date,
    p_stations: parsed.data.stations,
    p_override: parsed.data.override === "on",
  });
  if (error) return { ok: false, message: error.message };
  return done("Held.");
}

export async function setOfferStage(offerId: string, stage: "offered" | "declined" | "no_reply" | "not_offered") {
  await requireStaff(OFFICE_ROLES);
  const id = z.uuid().parse(offerId);
  const supabase = await createClient();
  await supabase
    .from("season_offers")
    .update({
      stage,
      offered_at: stage === "offered" ? new Date().toISOString() : undefined,
      responded_at: stage === "declined" || stage === "no_reply" ? new Date().toISOString() : undefined,
    })
    .eq("id", id)
    .in("stage", ["not_offered", "offered", "declined", "no_reply"]);
  revalidatePath("/season");
}

export async function extendHold(holdId: string) {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();
  await supabase.rpc("extend_hold", { p_hold_id: z.uuid().parse(holdId), p_days: 7 });
  revalidatePath("/season");
}

const Release = z.object({
  holdId: z.uuid(),
  reason: z.string().trim().max(500).optional(),
  stage: z.enum(["offered", "declined", "no_reply"]),
});

export async function releaseHold(_prev: BoardState, form: FormData): Promise<BoardState> {
  await requireStaff(OFFICE_ROLES);
  const parsed = Release.safeParse({
    holdId: form.get("hold_id"),
    reason: form.get("reason") || undefined,
    stage: form.get("stage"),
  });
  if (!parsed.success) return { ok: false, message: "Pick what happened." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("release_hold", {
    p_hold_id: parsed.data.holdId,
    p_reason: parsed.data.reason,
    p_offer_stage: parsed.data.stage,
  });
  if (error) return { ok: false, message: error.message };
  return done("Released. The stations are free.");
}
