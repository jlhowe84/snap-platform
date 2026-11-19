import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayIn } from "@/lib/dates";
import { planningDates } from "@/lib/planning/dates";
import { seasonForDate } from "@/lib/season";
import { buildDraft, firstName, isDraftKind, type DraftFacts } from "./drafts";
import { addressesOf } from "@/lib/mail/addresses";

// The daily clock. A server job with no signed-in person, so it uses the
// service role. The database decides what is due (public.clock_due); this
// file only turns each item into a drafted action waiting in the queue and
// logs it so it happens once. It never sends anything.

const Item = z.object({
  kind: z.string(),
  key: z.string(),
  job_id: z.uuid(),
  org_id: z.uuid().nullable().optional(),
  hold_id: z.uuid().optional(),
  expires_on: z.string().optional(),
  first_date: z.string().optional(),
  due_on: z.string().optional(),
  missing: z.array(z.string()).optional(),
});

export type ClockResult = { company: string; today: string; due: number; queued: number; errors: string[] };

/**
 * The scheduled run only touches companies whose clock.enabled setting is
 * true. An owner or admin can run one company by hand at any time.
 */
export async function runClock(onlyCompanyId?: string): Promise<ClockResult[]> {
  const admin = createAdminClient();
  let q = admin.from("companies").select("id, name, time_zone");
  if (onlyCompanyId) q = q.eq("id", onlyCompanyId);
  const { data: companies, error } = await q;
  if (error) throw new Error(`Could not list companies: ${error.message}`);

  const { data: enabledRows } = await admin.from("settings").select("company_id, value").eq("key", "clock.enabled");
  const enabled = new Set((enabledRows ?? []).filter((r) => r.value === true).map((r) => r.company_id));

  const { data: deadlineRows } = await admin.from("settings").select("company_id, value").eq("key", "chase.deadline_days");
  const deadlineDays = new Map(
    (deadlineRows ?? []).filter((r) => typeof r.value === "number").map((r) => [r.company_id, r.value as number]),
  );

  const results: ClockResult[] = [];
  for (const company of companies ?? []) {
    if (!onlyCompanyId && !enabled.has(company.id)) continue;
    const today = todayIn(company.time_zone);
    const result: ClockResult = { company: company.id, today, due: 0, queued: 0, errors: [] };
    results.push(result);

    const { data: due, error: dueError } = await admin.rpc("clock_due", { p_company: company.id, p_today: today });
    if (dueError) {
      result.errors.push(dueError.message);
      continue;
    }
    const items = z.array(Item).safeParse(due);
    if (!items.success) {
      result.errors.push("clock_due returned an unexpected shape");
      continue;
    }
    result.due = items.data.length;

    for (const item of items.data) {
      if (!isDraftKind(item.kind)) {
        result.errors.push(`unknown kind ${item.kind}`);
        continue;
      }
      const [{ data: job }, { data: people }, { data: days }] = await Promise.all([
        admin.from("jobs").select("name, organizations(name)").eq("id", item.job_id).maybeSingle(),
        admin.from("job_contacts").select("contacts(full_name, email)").eq("job_id", item.job_id),
        admin.from("photo_days").select("date").eq("job_id", item.job_id).order("date").limit(1),
      ]);
      const contacts = (people ?? [])
        .map((p) => p.contacts as { full_name: string; email: string | null } | null)
        .filter((c): c is { full_name: string; email: string } => !!c?.email);
      const photoDay = item.first_date ?? days?.[0]?.date ?? null;
      const facts: DraftFacts = {
        companyName: company.name,
        leagueName: (job?.organizations as { name: string } | null)?.name ?? job?.name ?? "your league",
        contactFirstName: firstName(contacts[0]?.full_name),
        to: addressesOf(contacts),
        season: seasonForDate(photoDay),
        photoDay,
        holdExpires: item.expires_on ?? null,
        dueOn: item.due_on ?? null,
        deadlineOn: planningDates(photoDay, 3, deadlineDays.get(company.id) ?? 10).deadline,
        missing: item.missing ?? [],
      };

      const { data: action, error: insertError } = await admin
        .from("agent_actions")
        .insert({
          company_id: company.id,
          action_type_key: item.kind,
          actor_kind: "system",
          status: "proposed",
          input: { clock_key: item.key, today },
          draft: buildDraft(item.kind, facts),
          record_refs: { job_id: item.job_id, org_id: item.org_id ?? null, hold_id: item.hold_id ?? null },
        })
        .select("id")
        .single();
      if (insertError || !action) {
        result.errors.push(insertError?.message ?? "could not queue a draft");
        continue;
      }
      const { error: logError } = await admin.from("clock_log").insert({
        company_id: company.id,
        key: item.key,
        kind: item.kind,
        job_id: item.job_id,
        outcome: "queued",
        missing: item.missing ?? null,
        action_id: action.id,
        run_on: today,
      });
      if (logError) {
        // Another run logged this step first: withdraw the duplicate draft.
        await admin.from("agent_actions").delete().eq("id", action.id);
        if (logError.code !== "23505") result.errors.push(logError.message);
        continue;
      }
      if (item.hold_id) {
        await admin.from("date_holds").update({ reminder_sent_at: new Date().toISOString() }).eq("id", item.hold_id);
      }
      result.queued++;
    }
  }
  return results;
}
