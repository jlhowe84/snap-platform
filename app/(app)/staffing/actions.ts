"use server";

import { savedMessages } from "@/lib/messages/server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { OFFICE_ROLES, requireStaff, type Viewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { liveSiteUrl } from "@/lib/site-url";
import { SHIFT_POSITIONS, nextWave, planShifts } from "@/lib/staffing/plan";
import { CREW_NOTICE_KEY, crewNotice, firstNameOf } from "@/lib/staffing/notices";
import { logOfferTexts } from "@/lib/sms/offers";

// Shifts for a photo day. Owner, admin and office publish and assign; RLS
// says the same. Crew answer offers on their own page (/shifts).

export type StaffingState = { ok: boolean; message: string } | null;

const id = z.uuid();
const time = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().regex(/^\d{2}:\d{2}$/).optional());
const count = z.coerce.number().int().min(0).max(40);

function refresh(dayId: string) {
  revalidatePath("/staffing");
  revalidatePath(`/staffing/${dayId}`);
}

/**
 * Queue a note to the crew member the office just put on or took off a shift.
 * It waits in the approval queue; nothing is sent from here.
 */
async function queueCrewNotice(viewer: Viewer, shiftId: string, crewMemberId: string, kind: "added" | "removed") {
  const supabase = await createClient();
  const [{ data: s }, { data: c }] = await Promise.all([
    supabase
      .from("shifts")
      .select("id, job_id, photo_day_id, position, start_time, end_time, photo_days(date, location_name, city, state), jobs(name)")
      .eq("id", shiftId)
      .maybeSingle(),
    supabase.from("crew_members").select("full_name, email").eq("id", crewMemberId).maybeSingle(),
  ]);
  if (!s || !c?.email || !s.photo_days || !s.jobs) return;
  // The link goes out in a message, so it opens the live site.
  const base = liveSiteUrl(await headers());
  const draft = crewNotice({
    kind,
    firstName: firstNameOf(c.full_name),
    jobName: s.jobs.name,
    date: s.photo_days.date,
    position: s.position,
    startTime: s.start_time,
    endTime: s.end_time,
    place: [s.photo_days.location_name, s.photo_days.city, s.photo_days.state].filter(Boolean).join(", ") || null,
    shiftsUrl: `${base}/shifts`,
    companyName: viewer.companyName,
  }, await savedMessages(supabase));
  await supabase.from("agent_actions").insert({
    company_id: viewer.companyId!,
    action_type_key: CREW_NOTICE_KEY,
    actor_kind: "person",
    actor_id: viewer.id,
    status: "proposed",
    draft: { to: [c.email], ...draft },
    record_refs: { job_id: s.job_id, photo_day_id: s.photo_day_id, shift_id: s.id, crew_member_id: crewMemberId, kind },
  });
}

const Plan = z.object({
  photographer: count,
  poser: count,
  coordinator: count,
  photo_attendant: count,
  start_time: time,
  end_time: time,
});

export async function addShifts(dayId: string, _prev: StaffingState, form: FormData): Promise<StaffingState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  const day = id.safeParse(dayId);
  const p = Plan.safeParse(Object.fromEntries(["start_time", "end_time", ...SHIFT_POSITIONS].map((k) => [k, form.get(k) ?? ""])));
  if (!day.success || !p.success) return { ok: false, message: "Check the counts and times." };
  if (p.data.start_time && p.data.end_time && p.data.end_time <= p.data.start_time) {
    return { ok: false, message: "The end time must be after the start time." };
  }
  const supabase = await createClient();
  const { data: pd } = await supabase.from("photo_days").select("id, job_id, stations").eq("id", day.data).maybeSingle();
  if (!pd) return { ok: false, message: "That photo day was not found." };
  const plan = planShifts(p.data, pd.stations);
  if (!plan.length) return { ok: false, message: "Add at least one shift." };
  const { error } = await supabase.from("shifts").insert(
    plan.map((s) => ({
      company_id: viewer.companyId,
      job_id: pd.job_id,
      photo_day_id: pd.id,
      position: s.position,
      station: s.station,
      start_time: p.data.start_time ?? null,
      end_time: p.data.end_time ?? null,
      created_by: viewer.id,
    })),
  );
  if (error) return { ok: false, message: "The shifts could not be added." };
  refresh(pd.id);
  return { ok: true, message: `Added ${plan.length} shift${plan.length === 1 ? "" : "s"}. They stay hidden from crew until you publish.` };
}

/** Publish every unpublished shift on the day, to Level 1 first. */
export async function publishShifts(dayId: string) {
  const viewer = await requireStaff(OFFICE_ROLES);
  const day = id.parse(dayId);
  const supabase = await createClient();
  await supabase.from("shifts").update({ status: "open", open_level: 1 }).eq("photo_day_id", day).eq("status", "draft");
  await textOffers(viewer, day);
  refresh(day);
}

/** Crew who can now take a shift, and said yes to texts, are told. A text problem never stops the publish. */
async function textOffers(viewer: Viewer, dayId: string) {
  await logOfferTexts(viewer.companyId!, viewer.companyName, dayId, liveSiteUrl(await headers())).catch(() => undefined);
}

/** Open every open shift on the day to the next Level. */
export async function openNextWave(dayId: string) {
  const viewer = await requireStaff(OFFICE_ROLES);
  const day = id.parse(dayId);
  const supabase = await createClient();
  const { data: open } = await supabase.from("shifts").select("id, open_level").eq("photo_day_id", day).eq("status", "open");
  for (const s of open ?? []) {
    if (s.open_level == null) continue;
    await supabase.from("shifts").update({ open_level: nextWave(s.open_level) }).eq("id", s.id).eq("status", "open");
  }
  await textOffers(viewer, day);
  refresh(day);
}

export async function assignShift(dayId: string, shiftId: string, form: FormData) {
  const viewer = await requireStaff(OFFICE_ROLES);
  const day = id.parse(dayId);
  const shift = id.parse(shiftId);
  const crew = id.safeParse(form.get("crew_member_id"));
  const supabase = await createClient();
  if (!crew.success) return;
  const { data: done } = await supabase
    .from("shifts")
    .update({ status: "filled", crew_member_id: crew.data, filled_by: "office" })
    .eq("id", shift)
    .in("status", ["draft", "open"])
    .select("id");
  if (done?.length) await queueCrewNotice(viewer, shift, crew.data, "added");
  refresh(day);
}

/** Take the person off and put the shift back up, to everyone. */
export async function releaseShift(dayId: string, shiftId: string) {
  const viewer = await requireStaff(OFFICE_ROLES);
  const day = id.parse(dayId);
  const shift = id.parse(shiftId);
  const supabase = await createClient();
  const { data: before } = await supabase.from("shifts").select("crew_member_id").eq("id", shift).maybeSingle();
  const { data: done } = await supabase
    .from("shifts")
    .update({ status: "open", crew_member_id: null, open_level: null })
    .eq("id", shift)
    .eq("status", "filled")
    .select("id");
  if (done?.length && before?.crew_member_id) await queueCrewNotice(viewer, shift, before.crew_member_id, "removed");
  refresh(day);
}

export async function cancelShift(dayId: string, shiftId: string) {
  const viewer = await requireStaff(OFFICE_ROLES);
  const day = id.parse(dayId);
  const supabase = await createClient();
  const shift = id.parse(shiftId);
  const { data: before } = await supabase.from("shifts").select("crew_member_id, status").eq("id", shift).maybeSingle();
  // An unpublished shift nobody has seen is removed; anything else is kept as cancelled.
  const { data: removed } = await supabase.from("shifts").delete().eq("id", shift).eq("status", "draft").select("id");
  if (!removed?.length) {
    await supabase.from("shifts").update({ status: "cancelled", crew_member_id: null, open_level: null }).eq("id", shift);
    if (before?.status === "filled" && before.crew_member_id) await queueCrewNotice(viewer, shift, before.crew_member_id, "removed");
  }
  refresh(day);
}

const Direct = z.object({
  crew: id,
  position: z.enum(SHIFT_POSITIONS),
  start_time: time,
  end_time: time,
});

/**
 * Put someone straight on a photo day, with no offer: a filled shift in the
 * office's name. The crew member gets a notice through the approval queue.
 */
export async function assignDirect(dayId: string, _prev: StaffingState, form: FormData): Promise<StaffingState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  const day = id.safeParse(dayId);
  const d = Direct.safeParse({
    crew: form.get("crew_member_id"),
    position: form.get("position"),
    start_time: form.get("start_time") ?? "",
    end_time: form.get("end_time") ?? "",
  });
  if (!day.success || !d.success) return { ok: false, message: "Pick a person and a position." };
  if (d.data.start_time && d.data.end_time && d.data.end_time <= d.data.start_time) {
    return { ok: false, message: "The end time must be after the start time." };
  }
  const supabase = await createClient();
  const { data: pd } = await supabase.from("photo_days").select("id, job_id, start_time, end_time").eq("id", day.data).maybeSingle();
  if (!pd) return { ok: false, message: "That photo day was not found." };
  const { data: taken } = await supabase
    .from("shifts")
    .select("id")
    .eq("photo_day_id", pd.id)
    .eq("crew_member_id", d.data.crew)
    .neq("status", "cancelled")
    .limit(1);
  if (taken?.length) return { ok: false, message: "They are already on this day." };
  const { data: row, error } = await supabase
    .from("shifts")
    .insert({
      company_id: viewer.companyId!,
      job_id: pd.job_id,
      photo_day_id: pd.id,
      position: d.data.position,
      status: "filled",
      crew_member_id: d.data.crew,
      filled_by: "office",
      start_time: d.data.start_time ?? pd.start_time,
      end_time: d.data.end_time ?? pd.end_time,
      created_by: viewer.id,
    })
    .select("id")
    .single();
  if (error || !row) return { ok: false, message: "They could not be added. They may already work another shift that day." };
  await queueCrewNotice(viewer, row.id, d.data.crew, "added");
  refresh(pd.id);
  revalidatePath(`/jobs/${pd.job_id}`);
  return { ok: true, message: "Added. Their notice is waiting in the approval queue." };
}
