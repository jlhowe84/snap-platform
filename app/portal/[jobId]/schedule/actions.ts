"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { portalJob } from "@/lib/portal/job";
import { makeRoom, placeRemaining, swapContents, type Slot } from "@/lib/schedule/layout";
import type { Notice } from "@/lib/schedule/notices";

// Every write here runs as the signed-in person, so the database decides:
// this job's coordinator may manage teams and slots; the office may do all
// of it; submitting is blocked until the schedule is complete.

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opt = (max: number) => z.preprocess(blank, z.string().trim().max(max).optional());

const Team = z.object({
  name: z.string().trim().min(1).max(120),
  division: opt(80),
  coach_name: opt(120),
  sponsor: opt(160),
  player_count: z.preprocess(blank, z.coerce.number().int().min(0).max(500).optional()),
  tc_number: opt(20),
});

const SlotInput = z.object({
  station: z.coerce.number().int().min(1).max(20),
  starts_at: z.string().regex(/^\d{2}:\d{2}$/),
  minutes: z.coerce.number().int().min(5).max(60).multipleOf(5),
  team_id: z.preprocess(blank, z.uuid().optional()),
  label: opt(80),
});

function back(jobId: string, dayId: string | null, notice?: Notice): never {
  const q = new URLSearchParams();
  if (dayId) q.set("day", dayId);
  if (notice) q.set("notice", notice);
  revalidatePath(`/portal/${jobId}`);
  redirect(`/portal/${jobId}/schedule${q.size ? `?${q}` : ""}`);
}

// After a change to the slots, refresh the page in place instead of
// navigating, so a drag or a swap keeps the person's place on the page.
function refreshSlots(jobId: string): void {
  revalidatePath(`/portal/${jobId}`);
}

async function open(jobId: string, dayId: string | null) {
  const ctx = await portalJob(jobId);
  if (!ctx?.canEdit) back(jobId, dayId, "The schedule is not open for changes.");
  return ctx;
}

const fields = (form: FormData) => Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));

export async function addTeam(jobId: string, dayId: string | null, form: FormData) {
  const ctx = await open(jobId, dayId);
  const t = Team.safeParse(fields(form));
  if (!t.success) back(jobId, dayId, "A team needs a name.");
  const { tc_number, ...team } = t.data;
  const { error } = await ctx.supabase.from("teams").insert({
    ...team,
    ...(ctx.office ? { tc_number } : {}),
    company_id: ctx.job.company_id,
    job_id: jobId,
    source: ctx.viewer.staff ? "office" : "coordinator",
  });
  if (error) back(jobId, dayId, error.code === "23505" ? "That team is already on the list." : "The team could not be added.");
  back(jobId, dayId);
}

export async function updateTeam(jobId: string, dayId: string | null, teamId: string, form: FormData) {
  const ctx = await open(jobId, dayId);
  const t = Team.safeParse(fields(form));
  if (!t.success) back(jobId, dayId, "A team needs a name.");
  const { tc_number, ...team } = t.data;
  const { error } = await ctx.supabase
    .from("teams")
    .update({
      name: team.name,
      division: team.division ?? null,
      coach_name: team.coach_name ?? null,
      sponsor: team.sponsor ?? null,
      player_count: team.player_count ?? null,
      ...(ctx.office ? { tc_number: tc_number ?? null } : {}),
    })
    .eq("id", teamId)
    .eq("job_id", jobId);
  if (error) back(jobId, dayId, error.code === "23505" ? "Another team already has that name." : "The team could not be saved.");
  back(jobId, dayId);
}

export async function removeTeam(jobId: string, dayId: string | null, teamId: string) {
  const ctx = await open(jobId, dayId);
  const { data } = await ctx.supabase.from("teams").delete().eq("id", teamId).eq("job_id", jobId).select("id");
  if (!data?.length) back(jobId, dayId, "That team came from your roster, so only our office can remove it. Send us a message and we will.");
  back(jobId, dayId);
}

export async function addSlot(jobId: string, dayId: string, scheduleId: string, kind: "team" | "break", form: FormData) {
  const ctx = await open(jobId, dayId);
  const s = SlotInput.safeParse(fields(form));
  if (!s.success || (kind === "team" && !s.data.team_id)) back(jobId, dayId, "Pick a team, a station, a start time and a length.");
  // A break pushes what follows it on that station later, so nobody has to
  // retime every team by hand. Moves run last slot first, so two slots never
  // sit on the same time on the way.
  if (kind === "break") {
    const { data: existing } = await ctx.supabase
      .from("schedule_slots")
      .select("id, station, starts_at, minutes, kind, team_id, label")
      .eq("schedule_id", scheduleId)
      .eq("job_id", jobId)
      .eq("station", s.data.station);
    const moves = makeRoom((existing ?? []) as Slot[], s.data.station, s.data.starts_at, s.data.minutes);
    if (!moves) back(jobId, dayId, "That break would push the last team past the end of the day.");
    for (const m of [...moves].reverse()) {
      const { error: moved } = await ctx.supabase.from("schedule_slots").update({ starts_at: m.starts_at }).eq("id", m.id).eq("job_id", jobId);
      if (moved) back(jobId, dayId, "The teams after the break could not be moved. Check the times and try again.");
    }
  }
  const { error } = await ctx.supabase.from("schedule_slots").insert({
    company_id: ctx.job.company_id,
    job_id: jobId,
    schedule_id: scheduleId,
    station: s.data.station,
    starts_at: s.data.starts_at,
    minutes: s.data.minutes,
    kind,
    team_id: kind === "team" ? s.data.team_id! : null,
    label: kind === "break" ? (s.data.label ?? "Break") : null,
  });
  if (error) back(jobId, dayId, "That slot could not be added.");
  refreshSlots(jobId);
}

export async function updateSlot(jobId: string, dayId: string, slotId: string, form: FormData) {
  const ctx = await open(jobId, dayId);
  const s = SlotInput.pick({ station: true, starts_at: true, minutes: true }).safeParse(fields(form));
  if (!s.success) back(jobId, dayId, "A slot needs a station, a start time and a length from 5 to 60 minutes.");
  const { error } = await ctx.supabase.from("schedule_slots").update(s.data).eq("id", slotId).eq("job_id", jobId);
  if (error) back(jobId, dayId, "That slot could not be changed.");
  refreshSlots(jobId);
}

export async function removeSlot(jobId: string, dayId: string, slotId: string) {
  const ctx = await open(jobId, dayId);
  await ctx.supabase.from("schedule_slots").delete().eq("id", slotId).eq("job_id", jobId);
  refreshSlots(jobId);
}

// Two slots trade the team (or break) they hold; times and stations stay put.
// The second write is undone if it fails, so a team is never left twice.
export async function swapSlots(jobId: string, dayId: string, firstId: string, secondId: string) {
  const ctx = await open(jobId, dayId);
  const ids = z.array(z.uuid()).length(2).safeParse([firstId, secondId]);
  if (!ids.success) back(jobId, dayId, "Those two slots could not be swapped.");
  const { data: rows } = await ctx.supabase
    .from("schedule_slots")
    .select("id, schedule_id, kind, team_id, label")
    .eq("job_id", jobId)
    .in("id", ids.data);
  const a = rows?.find((r) => r.id === firstId);
  const b = rows?.find((r) => r.id === secondId);
  const plan = a && b ? swapContents(a as Parameters<typeof swapContents>[0], b as Parameters<typeof swapContents>[1]) : null;
  if (!plan) back(jobId, dayId, "Those two slots could not be swapped.");
  const { error: first } = await ctx.supabase.from("schedule_slots").update(plan[0].set).eq("id", plan[0].id).eq("job_id", jobId);
  if (first) back(jobId, dayId, "Those two slots could not be swapped.");
  const { error: second } = await ctx.supabase.from("schedule_slots").update(plan[1].set).eq("id", plan[1].id).eq("job_id", jobId);
  if (second) {
    await ctx.supabase.from("schedule_slots").update(plan[1].set).eq("id", plan[0].id).eq("job_id", jobId);
    back(jobId, dayId, "Those two slots could not be swapped.");
  }
  refreshSlots(jobId);
}

// A first layout: every team without a slot goes on whichever station is
// free soonest, in list order. Nothing already placed is moved.
export async function placeRest(jobId: string, dayId: string, scheduleId: string, start: string) {
  const ctx = await open(jobId, dayId);
  const [{ data: schedule }, { data: teams }, { data: slots }, { data: elsewhere }] = await Promise.all([
    ctx.supabase.from("schedules").select("stations, default_block_minutes").eq("id", scheduleId).eq("job_id", jobId).maybeSingle(),
    ctx.supabase.from("teams").select("id").eq("job_id", jobId).order("division").order("name"),
    ctx.supabase.from("schedule_slots").select("station, starts_at, minutes, kind, team_id, label").eq("schedule_id", scheduleId),
    ctx.supabase.from("schedule_slots").select("team_id").eq("job_id", jobId).neq("schedule_id", scheduleId),
  ]);
  if (!schedule) back(jobId, dayId, "That schedule was not found.");
  const taken = new Set((elsewhere ?? []).map((s) => s.team_id));
  const added = placeRemaining(
    (teams ?? []).map((t) => t.id).filter((id) => !taken.has(id)),
    (slots ?? []) as Slot[],
    { stations: schedule.stations, start: /^\d{2}:\d{2}/.test(start) ? start.slice(0, 5) : "09:00", block: schedule.default_block_minutes },
  );
  if (!added.length) back(jobId, dayId, "Every team already has a slot.");
  const { error } = await ctx.supabase.from("schedule_slots").insert(
    added.map((s) => ({ ...s, company_id: ctx.job.company_id, job_id: jobId, schedule_id: scheduleId })),
  );
  if (error) back(jobId, dayId, "The teams could not be placed.");
  refreshSlots(jobId);
}

export async function submitSchedule(jobId: string, dayId: string, scheduleId: string) {
  const ctx = await open(jobId, dayId);
  const { error } = await ctx.supabase.rpc("submit_schedule", { p_schedule_id: scheduleId });
  if (error) back(jobId, dayId, "The schedule is not complete yet. Fix the items listed and submit again.");
  back(jobId, dayId, "Submitted. Thank you.");
}

const Setup = z.object({
  stations: z.coerce.number().int().min(1).max(20),
  default_block_minutes: z.coerce.number().int().min(5).max(60).multipleOf(5),
});

/** Office only (the database refuses a coordinator who changes stations). */
export async function saveSetup(jobId: string, dayId: string, scheduleId: string, form: FormData) {
  const ctx = await open(jobId, dayId);
  const s = Setup.safeParse(fields(form));
  if (!s.success || !ctx.office) back(jobId, dayId, "Stations are 1 to 20 and blocks are 5 to 60 minutes.");
  const { error } = await ctx.supabase.from("schedules").update(s.data).eq("id", scheduleId).eq("job_id", jobId);
  if (error) back(jobId, dayId, "The setup could not be saved.");
  back(jobId, dayId);
}

export async function setScheduleStatus(jobId: string, dayId: string, scheduleId: string, status: "started" | "complete") {
  const ctx = await open(jobId, dayId);
  const { error } = await ctx.supabase.rpc("set_schedule_status", { p_schedule_id: scheduleId, p_status: status });
  if (error) back(jobId, dayId, status === "complete" ? "The schedule still has open items." : "The schedule could not be reopened.");
  back(jobId, dayId);
}

/** The office starts a schedule by hand; a coordinator's opens on first visit. */
export async function startSchedule(jobId: string, dayId: string) {
  const ctx = await open(jobId, dayId);
  const { error } = await ctx.supabase.rpc("open_schedule", { p_photo_day_id: dayId });
  if (error) back(jobId, dayId, "The schedule is not open for changes.");
  back(jobId, dayId);
}
