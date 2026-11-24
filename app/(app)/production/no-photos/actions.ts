"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CASE_STATUSES, findNoPhotoOrders, readGalleryPlayers, type PrepayOrder } from "@/lib/production/no-photos";
import { buildMakeupOffer, MAKEUP_OFFER_KEY, MAKEUP_OFFER_SETTING, orderBuyer, readOfferTemplate } from "@/lib/production/makeup-offer";

export type NoPhotoState = { ok: boolean; message: string } | null;

function refresh(jobId: string | null) {
  revalidatePath("/queue");
  revalidatePath("/production");
  revalidatePath("/production/no-photos");
  if (jobId) revalidatePath(`/jobs/${jobId}`);
}

// Reads the job's gallery from Captura (read-only) and lists the prepay
// orders whose player has no images. Started by a person; it sends nothing
// and changes nothing in Captura. Rows are written as the signed-in person.
export async function checkNoPhotos(jobId: string): Promise<NoPhotoState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  if (!viewer.companyId || !z.uuid().safeParse(jobId).success) return { ok: false, message: "That job was not found." };
  const supabase = await createClient();
  const { data: link } = await supabase.from("job_links").select("captura_gallery_id").eq("job_id", jobId).maybeSingle();
  const galleryId = link?.captura_gallery_id;
  if (!galleryId) return { ok: false, message: "This job has no Captura gallery yet. Add its gallery number under Links first." };

  // The gallery's orders, from the order ledger. A gallery holds a few hundred.
  const orders: PrepayOrder[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase
      .from("captura_orders")
      .select("order_id, order_type, status, total, refunded, order_date, subject_ids")
      .eq("gallery_id", galleryId)
      .eq("order_type", "prepay")
      .order("order_id")
      .range(from, from + 999);
    if (error) return { ok: false, message: "The orders could not be read." };
    orders.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  if (orders.length === 0) {
    return { ok: false, message: "The order ledger holds no prepay orders for this gallery yet. Orders sync four times a day." };
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

  const check = findNoPhotoOrders(orders, readGalleryPlayers(raw));
  if (!check.ready) {
    return {
      ok: false,
      message:
        check.why === "no_players"
          ? "This gallery has no players loaded yet, so there is nothing to check."
          : "No player in this gallery has images yet. Run the check after the images are uploaded and assigned.",
    };
  }

  const now = new Date().toISOString();
  if (check.missing.length) {
    // Status and note are left out, so a case already being worked keeps them.
    const { error } = await supabase.from("prepay_photo_cases").upsert(
      check.missing.map((m) => ({
        company_id: viewer.companyId!,
        order_id: m.order_id,
        gallery_id: galleryId,
        job_id: jobId,
        reason: m.reason,
        player: m.player,
        team: m.team,
        order_date: m.order_date,
        total: m.total,
        last_checked_at: now,
        cleared_at: null,
      })),
      { onConflict: "company_id,order_id" },
    );
    if (error) return { ok: false, message: "The list could not be saved." };
  }
  // Orders listed before whose player has images now are cleared, not deleted.
  let clear = supabase.from("prepay_photo_cases").update({ cleared_at: now, last_checked_at: now }).eq("gallery_id", galleryId).is("cleared_at", null);
  if (check.missing.length) clear = clear.not("order_id", "in", `(${check.missing.map((m) => m.order_id).join(",")})`);
  const { data: cleared } = await clear.select("id");

  refresh(jobId);
  const n = check.missing.length;
  const found = n === 0 ? `All ${check.prepay} prepay orders have photos.` : `${n} of ${check.prepay} prepay orders ${n === 1 ? "has" : "have"} no photos.`;
  const gone = cleared?.length ? ` ${cleared.length} listed before ${cleared.length === 1 ? "has" : "have"} photos now.` : "";
  return { ok: true, message: found + gone };
}

const CaseEdit = z.object({
  status: z.enum(CASE_STATUSES),
  note: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(1000).nullable()),
});

/** Where one order stands: offered, booked, refunded or closed, with a note. */
export async function saveNoPhotoCase(caseId: string, _prev: NoPhotoState, form: FormData): Promise<NoPhotoState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  const parsed = CaseEdit.safeParse({ status: form.get("status"), note: form.get("note") ?? "" });
  if (!z.uuid().safeParse(caseId).success || !parsed.success) return { ok: false, message: "Pick a status. A note holds up to 1,000 characters." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prepay_photo_cases")
    .update({ ...parsed.data, updated_by: viewer.id })
    .eq("id", caseId)
    .select("job_id");
  if (error || !data?.length) return { ok: false, message: "That could not be saved." };
  refresh(data[0].job_id);
  return { ok: true, message: "Saved." };
}

// Drafts the makeup offer for one listed order and puts it in the approval
// queue. The buyer's email is read from Captura (read-only) for this draft
// only. Nothing is sent until a person approves it in the queue.
export async function draftMakeupOffer(caseId: string): Promise<NoPhotoState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  if (!viewer.companyId || !z.uuid().safeParse(caseId).success) return { ok: false, message: "That order was not found." };
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("prepay_photo_cases")
    .select("id, order_id, job_id, player, status, cleared_at, jobs(name, organizations(name))")
    .eq("id", caseId)
    .maybeSingle();
  if (!row) return { ok: false, message: "That order was not found." };
  if (row.cleared_at) return { ok: false, message: "This player has photos now, so no offer is needed." };
  if (row.status !== "open") return { ok: false, message: "This order is already past To do. Set it back to To do to draft an offer." };

  const { data: before } = await supabase
    .from("agent_actions")
    .select("id")
    .eq("action_type_key", MAKEUP_OFFER_KEY)
    .in("status", ["proposed", "approved", "edited", "sent"])
    .contains("record_refs", { case_id: row.id })
    .limit(1);
  if (before?.length) return { ok: false, message: "An offer for this order is already in the queue or sent." };

  let buyer: ReturnType<typeof orderBuyer>;
  try {
    const { loadCapturaCredentials, createCapturaClient } = await import("@/lib/captura/client");
    const creds = await loadCapturaCredentials(viewer.companyId);
    if (!creds) return { ok: false, message: "Captura is not connected. Connect it in Settings." };
    buyer = orderBuyer(await createCapturaClient(creds).getOrder(row.order_id), row.order_id);
  } catch {
    return { ok: false, message: "Captura did not answer. Nothing was drafted; try again in a minute." };
  }
  if (!buyer.email) return { ok: false, message: "Captura holds no email for this order, so the offer cannot be drafted here." };

  const { data: setting } = await supabase.from("settings").select("value").eq("key", MAKEUP_OFFER_SETTING).maybeSingle();
  const job = row.jobs as { name: string; organizations: { name: string } | null } | null;
  const draft = buildMakeupOffer(readOfferTemplate(setting?.value), {
    company: viewer.companyName ?? "The photo team",
    league: job?.organizations?.name ?? job?.name ?? null,
    player: row.player,
    parentFirstName: buyer.firstName,
    orderId: row.order_id,
    to: [buyer.email],
  });
  const { error } = await supabase.from("agent_actions").insert({
    company_id: viewer.companyId,
    action_type_key: MAKEUP_OFFER_KEY,
    actor_kind: "person",
    actor_id: viewer.id,
    status: "proposed",
    draft,
    record_refs: { job_id: row.job_id, case_id: row.id, order_id: row.order_id },
  });
  if (error) return { ok: false, message: "The offer could not be drafted." };
  refresh(row.job_id);
  return { ok: true, message: "Makeup offer drafted. Review and approve it in the queue." };
}
