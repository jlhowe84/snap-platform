"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { newPortalToken } from "@/lib/portal/token";
import { liveSiteUrl } from "@/lib/site-url";
import { sendSystemMail } from "@/lib/mail/system";
import { findSubject } from "@/lib/makeups/captura";
import { parentConfirmation } from "@/lib/makeups/messages";
import { BOOKING_STATUSES, FOLLOW_UP, isDate, isTime, KINDS, MAKEUP_SETTING, readSchedule } from "@/lib/makeups/schedule";
import { factsOf, insertBooking } from "@/lib/makeups/server";

export type MakeupState = { ok: boolean; message: string } | null;

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optional = (max: number) => z.preprocess(blank, z.string().trim().max(max).nullable());
const orderNumber = z.preprocess(blank, z.string().trim().regex(/^\d{1,12}$/).nullable());

function refresh() {
  revalidatePath("/production/makeups");
  revalidatePath("/production");
  revalidatePath("/calendar");
}

const Edit = z.object({
  status: z.enum(BOOKING_STATUSES),
  league: optional(160),
  team: optional(160),
  order_number: orderNumber,
  online_code: z.preprocess(blank, z.string().trim().regex(/^[A-Za-z0-9-]{1,40}$/).nullable()),
  staff_note: optional(2000),
});

/** Where one booking stands: its status, the slip details and the follow-up boxes. */
export async function saveBooking(id: string, _prev: MakeupState, form: FormData): Promise<MakeupState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  const parsed = Edit.safeParse(Object.fromEntries(["status", "league", "team", "order_number", "online_code", "staff_note"].map((k) => [k, form.get(k) ?? ""])));
  if (!z.uuid().safeParse(id).success || !parsed.success) {
    const field = parsed.success ? null : parsed.error.issues[0]?.path[0];
    return {
      ok: false,
      message:
        field === "online_code" ? "An online code is letters and numbers only." : field === "order_number" ? "An order number is digits only." : "That could not be saved. Check the form.",
    };
  }
  const supabase = await createClient();
  const { data: before } = await supabase.from("makeup_bookings").select("status").eq("id", id).maybeSingle();
  if (!before) return { ok: false, message: "That booking was not found." };
  const d = parsed.data;
  const boxes = Object.fromEntries(FOLLOW_UP.map((f) => [f.key, form.get(f.key) === "on"])) as Record<(typeof FOLLOW_UP)[number]["key"], boolean>;
  const cancelling = d.status === "cancelled" && before.status !== "cancelled";
  const { error } = await supabase
    .from("makeup_bookings")
    .update({
      ...boxes,
      status: d.status,
      league: d.league,
      team: d.team,
      order_number: d.order_number ? Number(d.order_number) : null,
      online_code: d.online_code,
      staff_note: d.staff_note,
      updated_by: viewer.id,
      ...(cancelling ? { cancelled_at: new Date().toISOString(), cancelled_by: "staff" } : {}),
      ...(d.status !== "cancelled" ? { cancelled_at: null, cancelled_by: null } : {}),
    })
    .eq("id", id);
  if (error) {
    return { ok: false, message: error.code === "23505" ? "That time has been taken by someone else since this was cancelled." : "That could not be saved." };
  }
  refresh();
  return { ok: true, message: "Saved." };
}

const Add = z.object({
  kind: z.enum(KINDS),
  date: z.string().refine(isDate),
  time: z.string().refine(isTime),
  player: z.string().trim().min(2).max(120),
  league: optional(160),
  team: optional(160),
  parent_name: optional(120),
  email: z.preprocess(blank, z.email().max(254).nullable()),
  phone: optional(40),
  order_number: orderNumber,
  note: optional(1000),
});

// The office books for a parent who called or emailed. The office may use
// any time, open hours or not; only the seats of a time are enforced.
export async function addBooking(_prev: MakeupState, form: FormData): Promise<MakeupState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  const parsed = Add.safeParse(Object.fromEntries(["kind", "date", "time", "player", "league", "team", "parent_name", "email", "phone", "order_number", "note"].map((k) => [k, form.get(k) ?? ""])));
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0]);
    const what: Record<string, string> = { date: "Pick a date.", time: "Pick a time.", player: "Enter the player's name.", email: "That email address does not look right.", order_number: "An order number is digits only." };
    return { ok: false, message: what[field] ?? "Check the form and try again." };
  }
  const b = parsed.data;
  const supabase = await createClient();
  const { data: setting } = await supabase.from("settings").select("value").eq("key", MAKEUP_SETTING).maybeSingle();
  const schedule = readSchedule(setting?.value);

  const order = b.order_number ? Number(b.order_number) : null;
  let linked: { id: string; job_id: string | null; status: string } | null = null;
  if (order) {
    const { data } = await supabase.from("prepay_photo_cases").select("id, job_id, status").eq("order_id", order).maybeSingle();
    linked = data;
  }
  const email = b.email?.trim().toLowerCase() ?? null;
  const { token, hash } = newPortalToken();
  const made = await insertBooking(
    supabase,
    {
      company_id: viewer.companyId,
      date: b.date,
      start_time: b.time,
      minutes: schedule.slotMinutes,
      kind: b.kind,
      source: "staff",
      player: b.player,
      league: b.league,
      team: b.team,
      parent_name: b.parent_name,
      email,
      phone: b.phone,
      order_number: order,
      parent_note: b.note,
      case_id: linked?.id ?? null,
      job_id: linked?.job_id ?? null,
      token_hash: hash,
      created_by: viewer.id,
    },
    schedule.perSlot,
  );
  if (!made.ok) return { ok: false, message: made.full ? "That time is full. Pick another." : "That could not be booked." };
  if (linked && (linked.status === "open" || linked.status === "offered")) {
    await supabase.from("prepay_photo_cases").update({ status: "makeup_booked", updated_by: viewer.id }).eq("id", linked.id);
  }

  let mailed = false;
  if (email && form.get("confirm") === "on") {
    const base = liveSiteUrl(await headers());
    mailed = await sendSystemMail(viewer.companyId, {
      to: [email],
      ...parentConfirmation(factsOf(made.booking), {
        company: viewer.companyName ?? "The photo team",
        place: schedule.place,
        details: schedule.details,
        manageUrl: `${base}/help/${viewer.companySlug}/makeup/b/${token}`,
      }),
    });
  }
  refresh();
  return { ok: true, message: mailed ? "Booked. A confirmation was emailed." : "Booked." };
}

// Reads the player's online code from Captura (read-only) so the photo slip
// can carry it. The order's own player is used when the booking has an order
// number; otherwise the name must match one player of the job's gallery.
export async function findOnlineCode(id: string): Promise<MakeupState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "That booking was not found." };
  const supabase = await createClient();
  const { data: b } = await supabase.from("makeup_bookings").select("id, player, team, order_number, job_id, case_id").eq("id", id).maybeSingle();
  if (!b) return { ok: false, message: "That booking was not found." };

  let galleryId: number | null = null;
  let subjectIds: string[] = [];
  if (b.order_number) {
    const { data: order } = await supabase.from("captura_orders").select("gallery_id, subject_ids").eq("order_id", b.order_number).maybeSingle();
    galleryId = order?.gallery_id ?? null;
    subjectIds = order?.subject_ids ?? [];
  }
  if (!galleryId && b.job_id) {
    const { data: link } = await supabase.from("job_links").select("captura_gallery_id").eq("job_id", b.job_id).maybeSingle();
    galleryId = link?.captura_gallery_id ? Number(link.captura_gallery_id) : null;
  }
  if (!galleryId) {
    return { ok: false, message: b.order_number ? "That order is not in the order ledger, so its gallery is not known. Type the online code in by hand." : "Add the order number first, or type the online code in by hand." };
  }

  let raw: unknown;
  try {
    const { loadCapturaCredentials, createCapturaClient } = await import("@/lib/captura/client");
    const creds = await loadCapturaCredentials(viewer.companyId);
    if (!creds) return { ok: false, message: "Captura is not connected. Connect it in Settings." };
    raw = await createCapturaClient(creds).getGallery(galleryId);
  } catch {
    return { ok: false, message: "Captura did not answer. Nothing was changed; try again in a minute." };
  }
  const search = findSubject(raw, { subjectIds, name: b.player });
  if (!search.found) {
    return { ok: false, message: search.why === "several" ? "More than one player in that gallery matches. Type the online code in by hand." : "No player in that gallery matches. Type the online code in by hand." };
  }
  if (!search.found.onlineCode) return { ok: false, message: "Captura holds no online code for that player." };

  let jobId = b.job_id;
  if (!jobId) {
    const { data: links } = await supabase.from("job_links").select("job_id").eq("captura_gallery_id", galleryId).limit(2);
    if (links?.length === 1) jobId = links[0].job_id;
  }
  const { error } = await supabase
    .from("makeup_bookings")
    .update({ online_code: search.found.onlineCode, team: b.team ?? search.found.team, job_id: jobId, updated_by: viewer.id })
    .eq("id", id);
  if (error) return { ok: false, message: "The code could not be saved." };
  refresh();
  return { ok: true, message: `Found ${search.found.name ?? "the player"}. The online code is on the slip.` };
}
