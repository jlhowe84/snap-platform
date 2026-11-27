"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/dates";
import { savedMessages } from "@/lib/messages/server";
import { buildGalleryLive, CLOSEOUT_DAYS_SETTING, closeoutDueOn, GALLERY_LIVE_KEY, readCloseoutDays } from "@/lib/delivery/drafts";
import { computeJobObligations, jobRecipients, queueCloseout } from "@/lib/delivery/server";

export type DeliveryState = { ok: boolean; message: string } | null;

const Id = z.uuid();
const Day = z.union([z.literal(""), z.iso.date()]);

function refresh(jobId: string) {
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/queue");
  revalidatePath("/obligations");
}

// Ticking Galleries live: images may have been in the galleries for days;
// this is when the league is told. The notice to the coordinator, with the
// gallery link, the coupon and the order deadline, waits in the queue for a
// person to approve. Nothing is sent here.
export async function markGalleriesLive(jobId: string, _prev: DeliveryState, form: FormData): Promise<DeliveryState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  const deadline = Day.safeParse(form.get("order_deadline") ?? "");
  if (!viewer.companyId || !Id.safeParse(jobId).success || !deadline.success) return { ok: false, message: "Check the order deadline." };
  const supabase = await createClient();
  const [{ data: job }, { data: links }] = await Promise.all([
    supabase.from("jobs").select("id, name, coupon, gallery_live_at, organizations(name)").eq("id", jobId).maybeSingle(),
    supabase.from("job_links").select("online_shop_url").eq("job_id", jobId).maybeSingle(),
  ]);
  if (!job) return { ok: false, message: "That job was not found." };
  if (job.gallery_live_at) return { ok: false, message: "Galleries are already marked live on this job." };
  const galleryLink = links?.online_shop_url?.trim();
  if (!galleryLink) return { ok: false, message: "Add the gallery or shop link under Links first, so the notice has something to share." };
  const { to, firstName } = await jobRecipients(supabase, jobId);
  if (!to.length) return { ok: false, message: "No coordinator on this job has an email address, so the notice cannot be drafted." };

  const draft = buildGalleryLive(
    {
      company: viewer.companyName ?? "The photo team",
      league: (job.organizations as { name: string } | null)?.name ?? job.name,
      contactFirstName: firstName,
      to,
      galleryLink,
      coupon: job.coupon,
      orderDeadline: deadline.data || null,
    },
    await savedMessages(supabase),
  );
  const { error: updateError } = await supabase
    .from("jobs")
    .update({ gallery_live_at: new Date().toISOString(), gallery_live_by: viewer.id, order_deadline: deadline.data || null })
    .eq("id", jobId)
    .is("gallery_live_at", null);
  if (updateError) return { ok: false, message: "The job could not be updated." };
  const { error } = await supabase.from("agent_actions").insert({
    company_id: viewer.companyId,
    action_type_key: GALLERY_LIVE_KEY,
    actor_kind: "person",
    actor_id: viewer.id,
    status: "proposed",
    draft,
    record_refs: { job_id: jobId },
  });
  if (error) {
    await supabase.from("jobs").update({ gallery_live_at: null, gallery_live_by: null }).eq("id", jobId);
    return { ok: false, message: "The notice could not be drafted, so the job was left as it was." };
  }
  refresh(jobId);
  return { ok: true, message: "Galleries marked live. The notice to the coordinator is in the queue to approve." };
}

async function closeoutDue(supabase: Awaited<ReturnType<typeof createClient>>, deliveredAt: string | null, timeZone: string) {
  if (!deliveredAt) return null;
  const { data } = await supabase.from("settings").select("value").eq("key", CLOSEOUT_DAYS_SETTING).maybeSingle();
  return closeoutDueOn(todayIn(timeZone, new Date(deliveredAt)), readCloseoutDays(data?.value));
}

// Works out what the league is owed from its terms and the order ledger and
// lists each as an obligation. Safe to press again: open amounts nobody
// changed are refreshed, everything else stays.
export async function workOutObligations(jobId: string): Promise<DeliveryState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  if (!viewer.companyId || !Id.safeParse(jobId).success) return { ok: false, message: "That job was not found." };
  const supabase = await createClient();
  const { data: job } = await supabase.from("jobs").select("delivered_at").eq("id", jobId).maybeSingle();
  if (!job) return { ok: false, message: "That job was not found." };
  try {
    const r = await computeJobObligations(supabase, {
      companyId: viewer.companyId,
      jobId,
      actorId: viewer.id,
      dueOn: await closeoutDue(supabase, job.delivered_at, viewer.timeZone),
    });
    refresh(jobId);
    const parts = [
      r.listed || r.updated ? `${r.listed} added, ${r.updated} refreshed.` : "The league's terms call for nothing owed.",
      r.noGallery ? "No Captura gallery is linked, so rebates have no amount yet." : "",
      r.sharedGallery ? "The gallery is shared with another job, so check the sales." : "",
    ];
    return { ok: true, message: parts.filter(Boolean).join(" ") };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "The amounts could not be worked out." };
  }
}

// The close-out by hand, before the clock gets to it: amounts first, then the
// thank-you, feedback and next-season email into the queue.
export async function draftCloseoutNow(jobId: string): Promise<DeliveryState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  if (!viewer.companyId || !Id.safeParse(jobId).success) return { ok: false, message: "That job was not found." };
  const supabase = await createClient();
  const { data: job } = await supabase.from("jobs").select("delivered_at, closed_out_at").eq("id", jobId).maybeSingle();
  if (!job) return { ok: false, message: "That job was not found." };
  try {
    await computeJobObligations(supabase, {
      companyId: viewer.companyId,
      jobId,
      actorId: viewer.id,
      dueOn: await closeoutDue(supabase, job.delivered_at, viewer.timeZone),
    });
  } catch {
    // The email still goes to the queue; the amounts can be worked out again.
  }
  const queued = await queueCloseout(supabase, {
    companyId: viewer.companyId,
    companyName: viewer.companyName ?? "The photo team",
    jobId,
    actor: { kind: "person", id: viewer.id },
  });
  refresh(jobId);
  if ("problem" in queued) return { ok: false, message: queued.problem };
  return { ok: true, message: "Close-out email drafted and amounts listed. Approve the email in the queue." };
}

const Kinds = z.enum(["rebate", "sponsorship", "donation", "facility_fee", "delivery_box", "charge", "other"]);
const Amount = z.union([z.literal(""), z.coerce.number().min(0).max(1_000_000)]);

const NewObligation = z.object({
  kind: Kinds,
  title: z.string().trim().min(1).max(200),
  amount: Amount,
  due_on: Day,
});

export async function addObligation(jobId: string, _prev: DeliveryState, form: FormData): Promise<DeliveryState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  const parsed = NewObligation.safeParse(Object.fromEntries(form));
  if (!viewer.companyId || !Id.safeParse(jobId).success || !parsed.success) return { ok: false, message: "Give it a name, and an amount of zero or more if you know it." };
  const supabase = await createClient();
  const { data: job } = await supabase.from("jobs").select("org_id").eq("id", jobId).maybeSingle();
  if (!job) return { ok: false, message: "That job was not found." };
  const { error } = await supabase.from("job_obligations").insert({
    company_id: viewer.companyId,
    job_id: jobId,
    org_id: job.org_id,
    kind: parsed.data.kind,
    direction: parsed.data.kind === "charge" ? "owed_in" : "owed_out",
    title: parsed.data.title,
    basis: "Added by hand",
    amount: parsed.data.amount === "" ? null : parsed.data.amount,
    amount_edited: true,
    due_on: parsed.data.due_on || null,
    created_by: viewer.id,
  });
  if (error) return { ok: false, message: "That could not be added." };
  refresh(jobId);
  return { ok: true, message: "Added." };
}

const Change = z.object({ amount: Amount, due_on: Day, owner_id: z.union([z.literal(""), z.uuid()]) });

export async function updateObligation(id: string, _prev: DeliveryState, form: FormData): Promise<DeliveryState> {
  await requireStaff(OFFICE_ROLES);
  const parsed = Change.safeParse(Object.fromEntries(form));
  if (!Id.safeParse(id).success || !parsed.success) return { ok: false, message: "Check the amount and date." };
  const supabase = await createClient();
  const { data: row } = await supabase.from("job_obligations").select("job_id, amount, status").eq("id", id).maybeSingle();
  if (!row) return { ok: false, message: "That was not found." };
  if (row.status !== "open") return { ok: false, message: "This one is closed. Reopen it to change it." };
  const amount = parsed.data.amount === "" ? null : parsed.data.amount;
  const changed = amount !== (row.amount === null ? null : Number(row.amount));
  const { error } = await supabase
    .from("job_obligations")
    .update({ amount, due_on: parsed.data.due_on || null, owner_id: parsed.data.owner_id || null, ...(changed ? { amount_edited: true } : {}) })
    .eq("id", id);
  if (error) return { ok: false, message: "That could not be saved." };
  refresh(row.job_id);
  return { ok: true, message: "Saved." };
}

const Close = z.object({
  outcome: z.enum(["closed", "void"]),
  closed_note: z.string().trim().max(1000),
  quickbooks_ref: z.string().trim().max(200),
});

// Closes with a note or a QuickBooks reference (one is needed), or voids
// when it turned out not to be owed.
export async function closeObligation(id: string, _prev: DeliveryState, form: FormData): Promise<DeliveryState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  const parsed = Close.safeParse(Object.fromEntries(form));
  if (!Id.safeParse(id).success || !parsed.success) return { ok: false, message: "Check the note." };
  if (!parsed.data.closed_note && !parsed.data.quickbooks_ref) return { ok: false, message: "Write a note (check number, who dropped it off) or a QuickBooks reference." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_obligations")
    .update({
      status: parsed.data.outcome,
      closed_note: parsed.data.closed_note || null,
      quickbooks_ref: parsed.data.quickbooks_ref || null,
      closed_at: new Date().toISOString(),
      closed_by: viewer.id,
    })
    .eq("id", id)
    .eq("status", "open")
    .select("job_id");
  if (error || !data?.length) return { ok: false, message: "That could not be closed." };
  refresh(data[0].job_id);
  return { ok: true, message: parsed.data.outcome === "void" ? "Marked not owed." : "Closed." };
}

export async function reopenObligation(id: string): Promise<DeliveryState> {
  await requireStaff(OFFICE_ROLES);
  if (!Id.safeParse(id).success) return { ok: false, message: "That was not found." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_obligations")
    .update({ status: "open", closed_at: null, closed_by: null })
    .eq("id", id)
    .select("job_id");
  if (error || !data?.length) return { ok: false, message: "That could not be reopened." };
  refresh(data[0].job_id);
  return { ok: true, message: "Reopened." };
}

const Lesson = z.object({ body: z.string().trim().min(1).max(2000) });

// A lesson from this job, written to the league's page so next season starts from it.
export async function addLesson(jobId: string, _prev: DeliveryState, form: FormData): Promise<DeliveryState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  const parsed = Lesson.safeParse({ body: form.get("body") ?? "" });
  if (!viewer.companyId || !Id.safeParse(jobId).success || !parsed.success) return { ok: false, message: "Write the lesson first (up to 2,000 characters)." };
  const supabase = await createClient();
  const { data: job } = await supabase.from("jobs").select("name, org_id").eq("id", jobId).maybeSingle();
  if (!job?.org_id) return { ok: false, message: "This job has no league to write the lesson to." };
  const { error } = await supabase.from("league_notes").insert({
    company_id: viewer.companyId,
    org_id: job.org_id,
    kind: "lesson",
    body: parsed.data.body,
    source: `Close-out: ${job.name}`,
    author_id: viewer.id,
  });
  if (error) return { ok: false, message: "The lesson could not be saved." };
  refresh(jobId);
  revalidatePath(`/leagues/${job.org_id}`);
  return { ok: true, message: "Lesson saved to the league page." };
}
