import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { MAKEUP_OFFER_KEY } from "./makeup-offer";

export type OfferState = Record<string, "waiting" | "approved" | "sent">;

/** Where each case's makeup offer stands in the approval queue. Rejected and failed drafts do not count. */
export async function loadOfferStates(supabase: SupabaseClient<Database>): Promise<OfferState> {
  const { data } = await supabase
    .from("agent_actions")
    .select("status, record_refs")
    .eq("action_type_key", MAKEUP_OFFER_KEY)
    .in("status", ["proposed", "approved", "edited", "sent"])
    .order("created_at")
    .limit(5000);
  const out: OfferState = {};
  for (const a of data ?? []) {
    const id = (a.record_refs as { case_id?: unknown } | null)?.case_id;
    if (typeof id !== "string") continue;
    out[id] = a.status === "sent" ? "sent" : a.status === "proposed" ? (out[id] ?? "waiting") : out[id] === "sent" ? "sent" : "approved";
  }
  return out;
}
