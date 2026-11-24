"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { newPortalToken } from "@/lib/portal/token";
import { liveSiteUrl } from "@/lib/site-url";
import { officeAddresses, sendSystemMail } from "@/lib/mail/system";
import { officeAlert, parentConfirmation } from "@/lib/makeups/messages";
import { bookingProblem, canCancel, KINDS, MAKEUP_SETTING, readSchedule, wallClock } from "@/lib/makeups/schedule";
import { bookingByToken, factsOf, insertBooking, loadPublicSchedule } from "@/lib/makeups/server";

export type BookState = { ok: boolean; message: string } | null;

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const Booking = z.object({
  kind: z.enum(KINDS),
  date: z.string(),
  time: z.string(),
  player: z.string().trim().min(2).max(120),
  league: z.preprocess(blank, z.string().trim().max(160).nullable()),
  team: z.preprocess(blank, z.string().trim().max(160).nullable()),
  parent_name: z.string().trim().min(2).max(120),
  email: z.email().max(254).transform((e) => e.trim().toLowerCase()),
  phone: z.preprocess(blank, z.string().trim().max(40).nullable()),
  order_number: z.preprocess(blank, z.string().trim().regex(/^\d{1,12}$/).nullable()),
  note: z.preprocess(blank, z.string().trim().max(1000).nullable()),
});

// A parent books a time from the public page. There is no signed-in person,
// so the server checks everything (the schedule, the lead time, the seat)
// and writes with the service role. Mail passes the guard: in test mode the
// confirmation and the office alert both go to the test address.
export async function bookMakeup(slug: string, _prev: BookState, form: FormData): Promise<BookState> {
  // A field people never see. Only a script fills it in.
  if (String(form.get("website") ?? "") !== "") return { ok: false, message: "That could not be booked." };
  const loaded = await loadPublicSchedule(slug);
  if (!loaded) return { ok: false, message: "That page was not found." };
  const { company, schedule, now } = loaded;

  const parsed = Booking.safeParse(Object.fromEntries(["kind", "date", "time", "player", "league", "team", "parent_name", "email", "phone", "order_number", "note"].map((k) => [k, form.get(k) ?? ""])));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const what: Record<string, string> = {
      time: "Pick a time.",
      player: "Enter the player's name.",
      parent_name: "Enter your name.",
      email: "Enter an email address we can reach you at.",
      order_number: "An order number is digits only. Leave it blank if you do not have one.",
    };
    return { ok: false, message: what[String(field)] ?? "Check the form and try again." };
  }
  const b = parsed.data;
  const problem = bookingProblem(schedule, { date: b.date, time: b.time }, now);
  if (problem) return { ok: false, message: problem };

  const admin = createAdminClient();
  const { count } = await admin
    .from("makeup_bookings")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company.id)
    .eq("status", "booked")
    .eq("email", b.email)
    .gte("date", now.date);
  if ((count ?? 0) >= 6) return { ok: false, message: "You already have several sessions booked. Reply to your confirmation email and we will help." };

  // An order number that is on the no-photos list ties the booking to that order and its job.
  const orderNumber = b.order_number ? Number(b.order_number) : null;
  let linked: { id: string; job_id: string | null; status: string } | null = null;
  if (orderNumber) {
    const { data } = await admin.from("prepay_photo_cases").select("id, job_id, status").eq("company_id", company.id).eq("order_id", orderNumber).maybeSingle();
    linked = data;
  }

  const { token, hash } = newPortalToken();
  const made = await insertBooking(
    admin,
    {
      company_id: company.id,
      date: b.date,
      start_time: b.time,
      minutes: schedule.slotMinutes,
      kind: b.kind,
      source: "parent",
      player: b.player,
      league: b.league,
      team: b.team,
      parent_name: b.parent_name,
      email: b.email,
      phone: b.phone,
      order_number: orderNumber,
      parent_note: b.note,
      case_id: linked?.id ?? null,
      job_id: linked?.job_id ?? null,
      token_hash: hash,
    },
    schedule.perSlot,
  );
  if (!made.ok) {
    return { ok: false, message: made.full ? "Someone just took that time. Pick another." : "That could not be booked. Please try again." };
  }
  if (linked && (linked.status === "open" || linked.status === "offered")) {
    await admin.from("prepay_photo_cases").update({ status: "makeup_booked" }).eq("id", linked.id);
  }

  const base = liveSiteUrl(await headers());
  const facts = factsOf(made.booking);
  if (schedule.emailParent) {
    await sendSystemMail(company.id, {
      to: [b.email],
      ...parentConfirmation(facts, { company: company.name, place: schedule.place, details: schedule.details, manageUrl: `${base}/help/${company.slug}/makeup/b/${token}` }),
    });
  }
  if (schedule.emailStaff) {
    await sendSystemMail(company.id, { to: await officeAddresses(company.id), ...officeAlert(facts, "booked", `${base}/production/makeups?date=${b.date}`) });
  }
  revalidatePath(`/help/${company.slug}/makeup`);
  redirect(`/help/${company.slug}/makeup/b/${token}?new=1`);
}

/** A parent cancels their own booking from their link, any time before it starts. */
export async function cancelMakeup(token: string): Promise<BookState> {
  const found = await bookingByToken(token);
  if (!found) return { ok: false, message: "That booking was not found." };
  const { booking, company } = found;
  if (booking.status !== "booked") return { ok: false, message: "This booking is not open any more." };
  if (!canCancel({ date: booking.date, time: booking.start_time.slice(0, 5) }, wallClock(company.timeZone))) {
    return { ok: false, message: "This session has already started, so it cannot be cancelled here." };
  }
  const admin = createAdminClient();
  const { data: changed } = await admin
    .from("makeup_bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: "parent" })
    .eq("id", booking.id)
    .eq("status", "booked")
    .select("id");
  if (!changed?.length) return { ok: false, message: "That could not be cancelled. Please try again." };
  // The order goes back on the office's list: the makeup is no longer booked.
  if (booking.case_id) {
    await admin.from("prepay_photo_cases").update({ status: "offered" }).eq("id", booking.case_id).eq("status", "makeup_booked");
  }
  const { data: setting } = await admin.from("settings").select("value").eq("company_id", company.id).eq("key", MAKEUP_SETTING).maybeSingle();
  if (readSchedule(setting?.value).emailStaff) {
    const base = liveSiteUrl(await headers());
    await sendSystemMail(company.id, {
      to: await officeAddresses(company.id),
      ...officeAlert(factsOf(booking), "cancelled", `${base}/production/makeups?date=${booking.date}`),
    });
  }
  revalidatePath(`/help/${company.slug}/makeup`);
  return { ok: true, message: "Your session is cancelled." };
}
