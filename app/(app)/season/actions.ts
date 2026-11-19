"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, OFFICE_ROLES, ADMIN_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSeasonLabel } from "@/lib/season";
import { buildDraft, firstName } from "@/lib/clock/drafts";
import { splitAddresses } from "@/lib/mail/addresses";

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

// Drafts the season offer for one league, or for every league still waiting
// to be offered. Drafts go to the approval queue; nothing is sent from here.
export async function draftOffers(season: string, offerId: string | null): Promise<BoardState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  if (!isSeasonLabel(season) || !viewer.companyId) return { ok: false, message: "Unknown season." };
  const supabase = await createClient();

  let q = supabase
    .from("season_offers")
    .select("id, org_id, priority_basis, organizations(name)")
    .eq("season", season)
    .eq("stage", "not_offered")
    .order("priority_rank", { ascending: true, nullsFirst: false })
    .limit(200);
  if (offerId) q = q.eq("id", z.uuid().parse(offerId));
  const [{ data: offers }, { data: waiting }] = await Promise.all([
    q,
    supabase.from("agent_actions").select("record_refs").eq("status", "proposed").eq("action_type_key", "offers.send"),
  ]);
  const already = new Set((waiting ?? []).map((a) => (a.record_refs as { offer_id?: string } | null)?.offer_id));
  const todo = (offers ?? []).filter((o) => !already.has(o.id));
  if (!todo.length) return { ok: true, message: "Those offers are already drafted. See the queue." };

  const { data: people } = await supabase
    .from("organization_contacts")
    .select("org_id, is_primary, contacts(full_name, email)")
    .in("org_id", todo.map((o) => o.org_id))
    .is("ended_on", null)
    .order("is_primary", { ascending: false });

  const rows = todo.map((o) => {
    const contact = (people ?? [])
      .filter((p) => p.org_id === o.org_id)
      .map((p) => p.contacts as { full_name: string; email: string | null } | null)
      .find((c) => c?.email);
    const basis = (o.priority_basis ?? {}) as { last_date?: string | null };
    return {
      company_id: viewer.companyId!,
      action_type_key: "offers.send",
      actor_kind: "person",
      actor_id: viewer.id,
      status: "proposed" as const,
      draft: buildDraft("offers.send", {
        companyName: viewer.companyName ?? "The photo team",
        leagueName: (o.organizations as { name: string } | null)?.name ?? "your league",
        contactFirstName: firstName(contact?.full_name),
        to: splitAddresses(contact?.email),
        season,
        lastPhotoDay: basis.last_date ?? null,
      }),
      record_refs: { offer_id: o.id, org_id: o.org_id },
    };
  });
  const { error } = await supabase.from("agent_actions").insert(rows);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/season");
  revalidatePath("/queue");
  return { ok: true, message: `Drafted ${rows.length} offer${rows.length === 1 ? "" : "s"}. Review them in the queue.` };
}
