import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { todayIn } from "@/lib/dates";
import { officeAddresses, sendSystemMail } from "@/lib/mail/system";
import { newPortalToken } from "@/lib/portal/token";
import { officeDigest, parentReminder } from "./messages";
import { addDays, MAKEUP_SETTING, readSchedule, type Kind } from "./schedule";
import { factsOf } from "./server";

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

// The day-before reminder to parents, run by the same daily job. Each booked
// session on tomorrow's list with an email gets one message with its own link
// to cancel. The booking is marked first, so a second run sends nothing, and
// every message passes the mail guard like the rest of the scheduler's mail.
export async function runParentReminders(baseUrl: string): Promise<{ company: string; sent: number }[]> {
  const admin = createAdminClient();
  const { data: companies } = await admin.from("companies").select("id, name, slug, time_zone");
  const out: { company: string; sent: number }[] = [];
  for (const company of companies ?? []) {
    const { data: setting } = await admin.from("settings").select("value").eq("company_id", company.id).eq("key", MAKEUP_SETTING).maybeSingle();
    const schedule = readSchedule(setting?.value);
    if (!schedule.remindParent) continue;
    const today = todayIn(company.time_zone);
    const { data: rows } = await admin
      .from("makeup_bookings")
      .select("id")
      .eq("company_id", company.id)
      .eq("date", addDays(today, 1))
      .eq("status", "booked")
      .not("email", "is", null)
      .is("parent_reminded_on", null)
      .order("start_time")
      .limit(200);
    let sent = 0;
    for (const row of rows ?? []) {
      const { token, hash } = newPortalToken();
      const { data: b } = await admin
        .from("makeup_bookings")
        .update({ parent_reminded_on: today, reminder_token_hash: hash })
        .eq("id", row.id)
        .eq("status", "booked")
        .is("parent_reminded_on", null)
        .select("*")
        .maybeSingle();
      if (!b?.email) continue;
      const ok = await sendSystemMail(company.id, {
        to: [b.email],
        ...parentReminder(factsOf(b), {
          company: company.name,
          place: schedule.place,
          details: schedule.details,
          manageUrl: `${baseUrl}/help/${company.slug}/makeup/b/${token}`,
        }),
      });
      if (ok) sent++;
    }
    if (rows?.length) out.push({ company: company.id, sent });
  }
  return out;
}
