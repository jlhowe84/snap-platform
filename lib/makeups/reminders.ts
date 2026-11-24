import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { todayIn } from "@/lib/dates";
import { officeAddresses, sendSystemMail } from "@/lib/mail/system";
import { officeDigest } from "./messages";
import { MAKEUP_SETTING, readSchedule, type Kind } from "./schedule";

// The morning reminder, run by the daily job (no signed-in person, so the
// service role). On a day with sessions booked, each office person gets one
// notice, and one email goes to the office when the schedule asks for it. The
// database marks the bookings as reminded, so a second run does nothing.
export async function runMakeupReminders(baseUrl: string): Promise<{ company: string; reminded: number }[]> {
  const admin = createAdminClient();
  const { data: companies } = await admin.from("companies").select("id, time_zone");
  const out: { company: string; reminded: number }[] = [];
  for (const company of companies ?? []) {
    const today = todayIn(company.time_zone);
    const { data: rows } = await admin
      .from("makeup_bookings")
      .select("kind, player, team, league, start_time")
      .eq("company_id", company.id)
      .eq("date", today)
      .eq("status", "booked")
      .is("reminded_on", null)
      .order("start_time");
    if (!rows?.length) continue;
    const { data: reminded } = await admin.rpc("makeup_reminders", { p_company: company.id, p_today: today });
    out.push({ company: company.id, reminded: reminded ?? 0 });
    if (!reminded) continue;
    const { data: setting } = await admin.from("settings").select("value").eq("company_id", company.id).eq("key", MAKEUP_SETTING).maybeSingle();
    if (!readSchedule(setting?.value).emailStaff) continue;
    await sendSystemMail(company.id, {
      to: await officeAddresses(company.id),
      ...officeDigest(
        today,
        rows.map((r) => ({ kind: r.kind as Kind, player: r.player, team: r.team, league: r.league, time: r.start_time.slice(0, 5) })),
        `${baseUrl}/production/makeups?date=${today}`,
      ),
    });
  }
  return out;
}
