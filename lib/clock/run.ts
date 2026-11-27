import "server-only";

import { z } from "zod";
import { savedMessages } from "@/lib/messages/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayIn } from "@/lib/dates";
import { planningDates } from "@/lib/planning/dates";
import { seasonForDate } from "@/lib/season";
import { buildDraft, firstName, isDraftKind, type DraftFacts } from "./drafts";
import { addressesOf } from "@/lib/mail/addresses";
import { CLOSEOUT_DAYS_SETTING, closeoutDueOn, readCloseoutDays } from "@/lib/delivery/drafts";
import { computeJobObligations, queueCloseout } from "@/lib/delivery/server";

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
    const saved = items.data.length ? await savedMessages(admin, company.id) : null;

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
          draft: buildDraft(item.kind, facts, saved),
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

    await runCloseouts(admin, company, today, result);
  }
  return results;
}

/**
 * Close-out: a set number of days after a job is delivered (the
 * closeout.days_after_delivery setting, 14 unless changed), the amounts the
 * league is owed are worked out and listed as obligations, and the close-out
 * email is drafted for a person to approve. Once per job, logged like the
 * other steps. Jobs delivered before delivery dates were recorded are never
 * picked up.
 */
async function runCloseouts(
  admin: ReturnType<typeof createAdminClient>,
  company: { id: string; name: string; time_zone: string },
  today: string,
  result: ClockResult,
) {
  const { data: setting } = await admin
    .from("settings")
    .select("value")
    .eq("company_id", company.id)
    .eq("key", CLOSEOUT_DAYS_SETTING)
    .maybeSingle();
  const days = readCloseoutDays(setting?.value);
  // Anything delivered at least days - 1 ago could be due today in the company's zone.
  const cutoff = new Date(Date.now() - (days - 1) * 86_400_000).toISOString();
  const { data: jobs, error } = await admin
    .from("jobs")
    .select("id, delivered_at")
    .eq("company_id", company.id)
    .in("status", ["delivered", "complete"])
    .is("closed_out_at", null)
    .not("delivered_at", "is", null)
    .lte("delivered_at", cutoff)
    .limit(200);
  if (error) {
    result.errors.push(`close-out: ${error.message}`);
    return;
  }
  for (const job of jobs ?? []) {
    const deliveredDay = todayIn(company.time_zone, new Date(job.delivered_at as string));
    const dueOn = closeoutDueOn(deliveredDay, days);
    if (dueOn > today) continue;
    const key = `closeout:${job.id}`;
    const { data: logged } = await admin.from("clock_log").select("key").eq("company_id", company.id).eq("key", key).maybeSingle();
    if (logged) continue;
    result.due++;
    try {
      await computeJobObligations(admin, { companyId: company.id, jobId: job.id, actorId: null, dueOn });
    } catch (e) {
      result.errors.push(`close-out amounts: ${e instanceof Error ? e.message : "failed"}`);
    }
    const queued = await queueCloseout(admin, { companyId: company.id, companyName: company.name, jobId: job.id, actor: { kind: "system" }, clockKey: key });
    const { error: logError } = await admin.from("clock_log").insert({
      company_id: company.id,
      key,
      kind: "delivery.closeout",
      job_id: job.id,
      outcome: "actionId" in queued ? "queued" : "not_needed",
      action_id: "actionId" in queued ? queued.actionId : null,
      run_on: today,
    });
    if (logError && logError.code !== "23505") result.errors.push(logError.message);
    if ("actionId" in queued) result.queued++;
    else result.errors.push(`close-out for job ${job.id}: ${queued.problem}`);
  }
}
