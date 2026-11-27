import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { addressesOf } from "@/lib/mail/addresses";
import { firstName } from "@/lib/clock/drafts";
import { savedMessages } from "@/lib/messages/server";
import { amountFor, planObligations, prepayTotals, type LedgerOrder, type PrepayTotals } from "./terms";
import { buildCloseout, CLOSEOUT_KEY } from "./drafts";

// Close-out work shared by the job page (the signed-in person's client, so
// RLS applies) and the daily clock (the service role, so every query names
// the job and every insert names the company).

type Client = SupabaseClient<Database>;

export type ComputeResult = { listed: number; updated: number; noGallery: boolean; sharedGallery: boolean };

/** Every prepay-relevant order of one gallery, page by page. */
async function galleryOrders(client: Client, companyId: string, galleryId: number): Promise<LedgerOrder[]> {
  const out: LedgerOrder[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client
      .from("captura_orders")
      .select("order_type, status, subtotal, discount")
      .eq("company_id", companyId)
      .eq("gallery_id", galleryId)
      .eq("order_type", "prepay")
      .order("order_id")
      .range(from, from + 999);
    if (error) throw new Error("The order ledger could not be read.");
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/**
 * Lists what a job's league is owed from its terms, with amounts from the
 * order ledger. Running it again refreshes amounts on open obligations that
 * nobody has changed by hand; closed ones and edited amounts stay.
 */
export async function computeJobObligations(
  client: Client,
  opts: { companyId: string; jobId: string; actorId: string | null; dueOn: string | null },
): Promise<ComputeResult> {
  const { data: job } = await client.from("jobs").select("id, org_id").eq("id", opts.jobId).eq("company_id", opts.companyId).maybeSingle();
  if (!job) throw new Error("That job was not found.");
  const [{ data: terms }, { data: links }] = await Promise.all([
    job.org_id
      ? client.from("organization_terms").select("services, rebate, sponsorship, delivery_method").eq("org_id", job.org_id).maybeSingle()
      : Promise.resolve({ data: null }),
    client.from("job_links").select("captura_gallery_id").eq("job_id", job.id).maybeSingle(),
  ]);
  const planned = planObligations({
    services: terms?.services ?? [],
    rebate: terms?.rebate ?? null,
    sponsorship: terms?.sponsorship ?? null,
    delivery_method: terms?.delivery_method ?? null,
  });

  const galleryId = links?.captura_gallery_id ?? null;
  let totals: PrepayTotals | null = null;
  let shared = false;
  if (galleryId && planned.some((p) => p.rule.rule === "percent_prepay" || p.rule.rule === "per_prepay_order")) {
    totals = prepayTotals(await galleryOrders(client, opts.companyId, galleryId));
    const { count } = await client
      .from("job_links")
      .select("job_id", { count: "exact", head: true })
      .eq("company_id", opts.companyId)
      .eq("captura_gallery_id", galleryId);
    shared = (count ?? 0) > 1;
  }

  const { data: existing } = await client
    .from("job_obligations")
    .select("id, term_key, status, amount_edited")
    .eq("job_id", job.id)
    .not("term_key", "is", null);
  const byKey = new Map((existing ?? []).map((e) => [e.term_key as string, e]));

  let listed = 0;
  let updated = 0;
  for (const p of planned) {
    const amount = amountFor(p.rule, totals);
    const computed = {
      ...p.rule,
      ...(totals && (p.rule.rule === "percent_prepay" || p.rule.rule === "per_prepay_order")
        ? { prepay_sales: totals.prepay_sales, prepay_orders: totals.prepay_orders, gallery_id: galleryId, shared_gallery: shared }
        : {}),
    } as unknown as Json;
    const had = byKey.get(p.term_key);
    if (had) {
      if (had.status !== "open") continue;
      const { error } = await client
        .from("job_obligations")
        .update({ computed, basis: p.basis, ...(had.amount_edited ? {} : { amount }) })
        .eq("id", had.id);
      if (!error) updated++;
      continue;
    }
    const { error } = await client.from("job_obligations").insert({
      company_id: opts.companyId,
      job_id: job.id,
      org_id: job.org_id,
      kind: p.kind,
      direction: p.direction,
      title: p.title,
      basis: p.basis,
      term_key: p.term_key,
      amount,
      computed,
      due_on: opts.dueOn,
      created_by: opts.actorId,
    });
    if (!error) listed++;
  }
  return { listed, updated, noGallery: !galleryId, sharedGallery: shared };
}

/** The job's coordinators with an email, for a delivery draft. */
export async function jobRecipients(client: Client, jobId: string) {
  const { data: people } = await client.from("job_contacts").select("contacts(full_name, email)").eq("job_id", jobId);
  const contacts = (people ?? [])
    .map((p) => p.contacts as { full_name: string; email: string | null } | null)
    .filter((c): c is { full_name: string; email: string } => !!c?.email);
  return { to: addressesOf(contacts), firstName: firstName(contacts[0]?.full_name) };
}

/**
 * Drafts the close-out email for one job and puts it in the queue, then
 * stamps the job closed out. Returns the action id, or null when the job
 * already has a close-out draft or has no one to write to.
 */
export async function queueCloseout(
  client: Client,
  opts: { companyId: string; companyName: string; jobId: string; actor: { kind: "person"; id: string } | { kind: "system" }; clockKey?: string },
): Promise<{ actionId: string } | { problem: string }> {
  const { data: job } = await client
    .from("jobs")
    .select("id, name, org_id, closed_out_at, organizations(name), photo_days(date)")
    .eq("id", opts.jobId)
    .eq("company_id", opts.companyId)
    .maybeSingle();
  if (!job) return { problem: "That job was not found." };
  const { data: before } = await client
    .from("agent_actions")
    .select("id")
    .eq("company_id", opts.companyId)
    .eq("action_type_key", CLOSEOUT_KEY)
    .in("status", ["proposed", "approved", "edited", "sent"])
    .contains("record_refs", { job_id: job.id })
    .limit(1);
  if (before?.length) return { problem: "A close-out email for this job is already in the queue or sent." };
  const { to, firstName: contactFirst } = await jobRecipients(client, job.id);
  if (!to.length) return { problem: "No coordinator on this job has an email address." };

  const firstDay = ((job.photo_days ?? []) as { date: string }[]).map((d) => d.date).sort()[0] ?? null;
  const draft = buildCloseout(
    {
      company: opts.companyName,
      league: (job.organizations as { name: string } | null)?.name ?? job.name,
      contactFirstName: contactFirst,
      to,
      firstPhotoDay: firstDay,
    },
    await savedMessages(client, opts.companyId),
  );
  const { data: action, error } = await client
    .from("agent_actions")
    .insert({
      company_id: opts.companyId,
      action_type_key: CLOSEOUT_KEY,
      actor_kind: opts.actor.kind,
      actor_id: opts.actor.kind === "person" ? opts.actor.id : null,
      status: "proposed",
      input: opts.clockKey ? { clock_key: opts.clockKey } : null,
      draft,
      record_refs: { job_id: job.id, org_id: job.org_id },
    })
    .select("id")
    .single();
  if (error || !action) return { problem: "The close-out email could not be drafted." };
  await client.from("jobs").update({ closed_out_at: new Date().toISOString() }).eq("id", job.id);
  return { actionId: action.id };
}
