"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// The order ledger. The server reads Captura; a person can ask for a check
// now and say which job a gallery belongs to.

export type OrdersState = { ok: boolean; message: string; more?: boolean } | null;

/** Reads Captura orders now: the last few days, then more of the history. */
export async function checkOrders(): Promise<OrdersState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  const { runOrderSync } = await import("@/lib/orders/sync");
  try {
    const [r] = await runOrderSync(viewer.companyId, 40_000);
    revalidatePath("/orders");
    if (!r) return { ok: false, message: "The orders could not be read." };
    if (r.error) return { ok: false, message: r.error };
    const read = `${r.orders.toLocaleString("en-US")} ${r.orders === 1 ? "order" : "orders"} read.`;
    if (!r.historyDone) return { ok: true, more: true, message: `${read} Older orders are still loading, from ${r.historyFrom ?? "the start"}.` };
    return { ok: true, message: read };
  } catch {
    return { ok: false, message: "The orders could not be read." };
  }
}

const Link = z.object({ gallery: z.coerce.number().int().positive(), job: z.union([z.literal(""), z.uuid()]) });

/** Ties a Captura gallery to a job, or clears the tie. */
export async function linkGallery(_prev: OrdersState, form: FormData): Promise<OrdersState> {
  await requireStaff(OFFICE_ROLES);
  const parsed = Link.safeParse({ gallery: form.get("gallery"), job: form.get("job") ?? "" });
  if (!parsed.success) return { ok: false, message: "Pick a job." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("link_gallery_to_job", {
    p_gallery: parsed.data.gallery,
    p_job: (parsed.data.job || null) as unknown as string,
  });
  if (error) return { ok: false, message: "The link could not be saved." };
  revalidatePath("/orders");
  return { ok: true, message: parsed.data.job ? "Gallery linked to the job." : "Link cleared." };
}
