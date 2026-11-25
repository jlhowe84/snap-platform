import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { todayIn } from "@/lib/dates";
import { addDays } from "@/lib/makeups/schedule";
import { crewDayBeforeText } from "./crew";
import { sendLoggedTexts } from "./send";

// The morning before a photo day, each crew member on it who said yes to
// texts gets a reminder with a link to the day's page. Runs with the daily
// job. Each reminder is logged once (its key is the photo day), and the
// sender (lib/sms/send.ts) decides whether it goes anywhere.

export type DayBeforeResult = { company: string; logged: number };

export async function runCrewDayBefore(baseUrl: string): Promise<DayBeforeResult[]> {
  const admin = createAdminClient();
  const { data: companies } = await admin.from("companies").select("id, name, time_zone");
  const out: DayBeforeResult[] = [];
  for (const c of companies ?? []) {
    const tomorrow = addDays(todayIn(c.time_zone), 1);
    const { data: shifts } = await admin
      .from("shifts")
      .select("crew_member_id, position, start_time, end_time, photo_day_id, photo_days!inner(date, status, location_name, city, state), jobs(name)")
      .eq("company_id", c.id)
      .eq("status", "filled")
      .eq("photo_days.date", tomorrow)
      .eq("photo_days.status", "scheduled");
    let logged = 0;
    for (const s of shifts ?? []) {
      if (!s.crew_member_id || !s.jobs) continue;
      const { data: answer } = await admin
        .from("sms_consents")
        .select("opted_in, phone")
        .eq("crew_member_id", s.crew_member_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!answer?.opted_in || !answer.phone) continue;
      const body = crewDayBeforeText({
        company: c.name,
        jobName: s.jobs.name,
        position: s.position,
        startTime: s.start_time,
        endTime: s.end_time,
        place: [s.photo_days.location_name, s.photo_days.city].filter(Boolean).join(", ") || null,
        link: `${baseUrl}/field/${s.photo_day_id}`,
      });
      const { data: row } = await admin
        .from("text_messages")
        .upsert(
          { company_id: c.id, crew_member_id: s.crew_member_id, to_phone: answer.phone, kind: "crew.day_before", body, ref_key: `day:${s.photo_day_id}` },
          { onConflict: "company_id,kind,crew_member_id,ref_key", ignoreDuplicates: true },
        )
        .select("id");
      if (row?.length) logged++;
    }
    out.push({ company: c.id, logged });
    await sendLoggedTexts(c.id, undefined, admin);
  }
  return out;
}
