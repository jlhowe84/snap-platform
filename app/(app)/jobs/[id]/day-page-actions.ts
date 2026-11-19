"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, OFFICE_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { makeSlug } from "@/lib/public/day-page";

export type DayPageState = { ok: boolean; message: string } | null;

const text = z.string().trim().max(2000).transform((v) => v || null);
const Fields = z.object({
  jobId: z.uuid(),
  published: z.boolean(),
  showTeamTimes: z.boolean(),
  wear: text,
  bring: text,
  note: text,
});

// Saves the job's public page, making it (with a fresh slug) the first time.
export async function saveDayPage(jobId: string, _prev: DayPageState, form: FormData): Promise<DayPageState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  const parsed = Fields.safeParse({
    jobId,
    published: form.get("published") === "on",
    showTeamTimes: form.get("show_team_times") === "on",
    wear: form.get("what_to_wear") ?? "",
    bring: form.get("what_to_bring") ?? "",
    note: form.get("note") ?? "",
  });
  if (!parsed.success) return { ok: false, message: "Each box holds up to 2,000 characters." };
  const p = parsed.data;
  const supabase = await createClient();
  const fields = { published: p.published, show_team_times: p.showTeamTimes, what_to_wear: p.wear, what_to_bring: p.bring, note: p.note };

  const { data: existing } = await supabase.from("day_pages").select("job_id").eq("job_id", p.jobId).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("day_pages").update(fields).eq("job_id", p.jobId);
    if (error) return { ok: false, message: "Could not save. Try again." };
  } else {
    const { data: job } = await supabase.from("jobs").select("name, organizations(name)").eq("id", p.jobId).maybeSingle();
    if (!job) return { ok: false, message: "That job was not found." };
    const base = (job.organizations as { name: string } | null)?.name ?? job.name;
    let error: { code?: string } | null = null;
    for (let i = 0; i < 3; i++) {
      ({ error } = await supabase
        .from("day_pages")
        .insert({ ...fields, job_id: p.jobId, company_id: viewer.companyId!, slug: makeSlug(base) }));
      if (!error || error.code !== "23505") break;
    }
    if (error) return { ok: false, message: "Could not make the page. Try again." };
  }
  revalidatePath(`/jobs/${p.jobId}`);
  return { ok: true, message: p.published ? "Saved. The page is live." : "Saved. The page is off; nobody can open it." };
}
