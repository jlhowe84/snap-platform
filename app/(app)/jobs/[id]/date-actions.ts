"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, ADMIN_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { firstName } from "@/lib/clock/drafts";
import { formatDate } from "@/lib/dates";
import { buildDateNotice, DATE_CHANGE_KINDS } from "@/lib/jobs/date-change";
import { addressesOf } from "@/lib/mail/addresses";

export type DateChangeState = { ok: boolean; message: string } | null;

const Change = z.object({
  jobId: z.uuid(),
  photoDayId: z.uuid(),
  kind: z.enum(DATE_CHANGE_KINDS),
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reason: z.string().trim().min(1).max(500),
  notify: z.boolean(),
  override: z.boolean(),
});

// Moving, postponing or cancelling a photo day is one action for an owner or
// admin. The database function runs the cascade; this builds the notice that
// goes to the approval queue with it. Nothing is sent from here.
export async function changePhotoDay(jobId: string, photoDayId: string, _prev: DateChangeState, form: FormData): Promise<DateChangeState> {
  const viewer = await requireStaff(ADMIN_ROLES);
  const parsed = Change.safeParse({
    jobId,
    photoDayId,
    kind: form.get("kind"),
    newDate: form.get("new_date") || undefined,
    reason: form.get("reason"),
    notify: form.get("notify") === "on",
    override: form.get("override") === "on",
  });
  if (!parsed.success) return { ok: false, message: "Pick what is changing and give a reason." };
  const d = parsed.data;
  if (d.kind === "reschedule" && !d.newDate) return { ok: false, message: "Pick the new date." };

  const supabase = await createClient();
  const [{ data: day }, { data: job }, { data: people }] = await Promise.all([
    supabase.from("photo_days").select("date").eq("id", d.photoDayId).eq("job_id", d.jobId).maybeSingle(),
    supabase.from("jobs").select("name, organizations(name)").eq("id", d.jobId).maybeSingle(),
    supabase.from("job_contacts").select("contacts(full_name, email)").eq("job_id", d.jobId),
  ]);
  if (!day || !job) return { ok: false, message: "That photo day could not be found." };

  const contacts = (people ?? [])
    .map((p) => p.contacts as { full_name: string; email: string | null } | null)
    .filter((c): c is { full_name: string; email: string } => !!c?.email);
  const notice =
    d.notify && contacts.length
      ? buildDateNotice({
          kind: d.kind,
          companyName: viewer.companyName ?? "SNAP",
          leagueName: (job.organizations as { name: string } | null)?.name ?? job.name,
          contactFirstName: firstName(contacts[0].full_name),
          to: addressesOf(contacts),
          fromDate: day.date,
          toDate: d.newDate ?? null,
        })
      : null;

  const { error } = await supabase.rpc("change_photo_day", {
    p_photo_day: d.photoDayId,
    p_kind: d.kind,
    p_new_date: d.kind === "reschedule" ? d.newDate : undefined,
    p_reason: d.reason,
    p_notice: notice ?? undefined,
    p_override: d.override,
  });
  if (error) {
    const m = error.message.trim();
    return { ok: false, message: m.charAt(0).toUpperCase() + m.slice(1) + (m.endsWith(".") ? "" : ".") };
  }

  revalidatePath(`/jobs/${d.jobId}`);
  revalidatePath("/queue");
  const what =
    d.kind === "reschedule" ? `Moved to ${formatDate(d.newDate, { weekday: true })}.` : d.kind === "postpone" ? "Postponed." : "Cancelled.";
  const next = notice
    ? " A notice to the coordinator is waiting in the queue."
    : d.notify
      ? " No notice was drafted: the job has no contact with an email."
      : "";
  return { ok: true, message: `${what}${next} Tasks for Captura and the calendar were added.` };
}
