import "server-only";

import { createClient } from "@/lib/supabase/server";
import { crewOfferText, offersFor } from "./crew";
import { sendLoggedTexts } from "./send";

// When shifts on a photo day are published, or opened to the next Level, the
// crew who can now take one and said yes to texts are told by text. Runs as
// the office person who pressed the button; log_crew_text checks each crew
// member's answer and logs a day's offer once per person.

export async function logOfferTexts(companyId: string, companyName: string | null, dayId: string, baseUrl: string) {
  const supabase = await createClient();
  const [{ data: day }, { data: open }, { data: taken }, { data: crew }] = await Promise.all([
    supabase.from("photo_days").select("date, status, jobs(name)").eq("id", dayId).maybeSingle(),
    supabase.from("shifts").select("position, open_level").eq("photo_day_id", dayId).eq("status", "open"),
    supabase.from("shifts").select("crew_member_id").eq("photo_day_id", dayId).eq("status", "filled"),
    supabase.from("crew_members").select("id, positions, level").eq("active", true),
  ]);
  if (!day || day.status !== "scheduled" || !day.jobs || !open?.length) return;
  const busy = new Set((taken ?? []).map((t) => t.crew_member_id));
  const ids: string[] = [];
  for (const c of crew ?? []) {
    if (busy.has(c.id)) continue;
    const positions = offersFor(c, open);
    if (!positions.length) continue;
    const body = crewOfferText({ company: companyName, jobName: day.jobs.name, date: day.date, positions, link: `${baseUrl}/shifts` });
    const { data: id } = await supabase.rpc("log_crew_text", {
      p_crew_member_id: c.id,
      p_kind: "crew.offer",
      p_body: body,
      p_agent_action_id: null as unknown as string, // an offer has no queued email behind it
      p_ref_key: `offer:${dayId}`,
    });
    if (id) ids.push(id);
  }
  if (ids.length) await sendLoggedTexts(companyId, ids);
}
