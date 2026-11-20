import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createCapturaClient, loadCapturaCredentials } from "@/lib/captura/client";
import { pageRows } from "@/lib/captura/shape";
import { mapOrder, type GalleryRow, type OrderRow } from "./map";
import { historyWindow, ORDER_SETTING_KEYS, orderSettings, PAGE, shiftDay, type SyncCounts } from "./plan";

// Reads Captura orders into the ledger. A server job, so it uses the service
// role, and it only reads Captura. Each run does three things within a time
// budget, and running it twice is harmless because an order is stored once
// under its Captura id:
//   1. the last few days, so new orders and today's refunds land;
//   2. a stretch of the history, a week at a time, resuming where the last
//      run stopped, until it reaches those last few days;
//   3. a few recent galleries in full, because an older prepay order's
//      shipment and refund change long after its order date.

const BUDGET_MS = 45_000;
// A Captura page can take several seconds; do not start one this close to the
// end of the budget, so the run finishes and saves its place in time.
const PAGE_RESERVE_MS = 12_000;
const GALLERY_REFRESH = 4;
const GALLERY_WINDOW_DAYS = 60;
const GALLERY_STALE_MS = 6 * 60 * 60 * 1000;

export type OrderSyncResult = SyncCounts & { company: string; historyFrom: string | null; historyDone: boolean; error: string | null };

type Admin = ReturnType<typeof createAdminClient>;

async function store(admin: Admin, companyId: string, rows: OrderRow[], galleries: Map<number, GalleryRow>) {
  if (galleries.size) {
    const { error } = await admin
      .from("captura_galleries")
      .upsert(
        [...galleries.values()].map((g) => ({ company_id: companyId, gallery_id: g.gallery_id, title: g.title, updated_at: new Date().toISOString() })),
        { onConflict: "company_id,gallery_id", ignoreDuplicates: false },
      );
    if (error) throw new Error(`Could not store galleries: ${error.message}`);
  }
  if (rows.length) {
    // One page can list the same order twice when Captura splits it; keep the last.
    const unique = [...new Map(rows.map((r) => [r.order_id, { ...r, synced_at: new Date().toISOString() }])).values()];
    const { error } = await admin.from("captura_orders").upsert(unique, { onConflict: "company_id,order_id" });
    if (error) throw new Error(`Could not store orders: ${error.message}`);
  }
}

function fold(raw: unknown[], companyId: string, timeZone: string, counts: SyncCounts) {
  const rows: OrderRow[] = [];
  const galleries = new Map<number, GalleryRow>();
  for (const item of raw) {
    const m = mapOrder(item, companyId, timeZone);
    if (m.kind === "order") {
      rows.push(m.row);
      if (m.gallery) galleries.set(m.gallery.gallery_id, m.gallery);
    } else if (m.kind === "adjustment") counts.adjustments += 1;
    else counts.skipped += 1;
  }
  counts.orders += rows.length;
  return { rows, galleries };
}

/** Keeps each gallery's first and last order dates in step with its orders. */
async function stampGalleries(admin: Admin, companyId: string, ids: number[]) {
  if (!ids.length) return;
  const { error } = await admin.rpc("stamp_captura_galleries", { p_company: companyId, p_galleries: ids });
  if (error) throw new Error(`Could not update gallery dates: ${error.message}`);
}

export async function runOrderSync(onlyCompanyId?: string, budgetMs = BUDGET_MS): Promise<OrderSyncResult[]> {
  const admin = createAdminClient();
  let q = admin.from("companies").select("id, time_zone");
  if (onlyCompanyId) q = q.eq("id", onlyCompanyId);
  const { data: companies, error } = await q;
  if (error) throw new Error(`Could not list companies: ${error.message}`);

  const results: OrderSyncResult[] = [];
  for (const company of companies ?? []) {
    const { data: settingRows } = await admin.from("settings").select("key, value").eq("company_id", company.id).in("key", ORDER_SETTING_KEYS);
    const settings = orderSettings(settingRows ?? []);
    if (!onlyCompanyId && !settings.enabled) continue;

    const timeZone = company.time_zone || "America/New_York";
    const deadline = Date.now() + budgetMs - PAGE_RESERVE_MS;
    const counts: SyncCounts = { orders: 0, adjustments: 0, skipped: 0, pages: 0, galleries: 0 };
    const result: OrderSyncResult = { ...counts, company: company.id, historyFrom: null, historyDone: false, error: null };
    results.push(result);
    const touched = new Set<number>();

    const { data: state } = await admin.from("captura_order_sync").select("next_from, next_start, history_done").eq("company_id", company.id).maybeSingle();
    let nextFrom: string | null = state?.next_from ?? null;
    let nextStart = state?.next_start ?? 1;
    let historyDone = state?.history_done ?? false;

    try {
      const creds = await loadCapturaCredentials(company.id);
      if (!creds) throw new Error("No Captura key is stored.");
      const captura = createCapturaClient(creds);
      const todayUtc = new Date().toISOString().slice(0, 10);
      const recentFrom = shiftDay(todayUtc, -settings.recentDays);

      const readRange = async (from: string, to: string, start: number) => {
        // Captura's start date is exclusive and its end date inclusive.
        const page = await captura.listOrders({ start, end: start + PAGE - 1, orderStartDate: shiftDay(from, -1), orderEndDate: to });
        counts.pages += 1;
        const { rows } = pageRows(page);
        const folded = fold(rows, company.id, timeZone, counts);
        await store(admin, company.id, folded.rows, folded.galleries);
        for (const id of folded.galleries.keys()) touched.add(id);
        return rows.length;
      };

      // 1. The last few days.
      for (let start = 1; Date.now() < deadline; start += PAGE) {
        if ((await readRange(recentFrom, todayUtc, start)) < PAGE) break;
      }

      // 2. The history, a week at a time, resuming where the last run stopped.
      if (!nextFrom) nextFrom = settings.historyFrom ?? shiftDay(todayUtc, -365);
      while (!historyDone && Date.now() < deadline) {
        const w = historyWindow(nextFrom, recentFrom);
        if (!w) {
          historyDone = true;
          break;
        }
        const n = await readRange(w.from, w.to, nextStart);
        if (n < PAGE) {
          nextFrom = w.next;
          nextStart = 1;
        } else nextStart += PAGE;
        // Save the place after every page, so a run cut short loses nothing.
        await admin.from("captura_order_sync").upsert({ company_id: company.id, next_from: nextFrom, next_start: nextStart, history_done: false });
      }

      // 3. A few recent galleries in full, least recently refreshed first.
      if (Date.now() < deadline) {
        const { data: due } = await admin
          .from("captura_galleries")
          .select("gallery_id, refreshed_at")
          .eq("company_id", company.id)
          .gte("last_order_on", shiftDay(todayUtc, -GALLERY_WINDOW_DAYS))
          .order("refreshed_at", { ascending: true, nullsFirst: true })
          .limit(GALLERY_REFRESH);
        for (const g of due ?? []) {
          if (Date.now() >= deadline) break;
          if (g.refreshed_at && Date.now() - new Date(g.refreshed_at).getTime() < GALLERY_STALE_MS) continue;
          let complete = true;
          for (let start = 1; ; start += PAGE) {
            if (Date.now() >= deadline) {
              complete = false;
              break;
            }
            const page = await captura.listGalleryOrders(g.gallery_id, { start, end: start + PAGE - 1 });
            counts.pages += 1;
            const { rows } = pageRows(page);
            const folded = fold(rows, company.id, timeZone, counts);
            await store(admin, company.id, folded.rows, folded.galleries);
            if (rows.length < PAGE) break;
          }
          if (complete) {
            counts.galleries += 1;
            touched.add(g.gallery_id);
            await admin.from("captura_galleries").update({ refreshed_at: new Date().toISOString() }).eq("company_id", company.id).eq("gallery_id", g.gallery_id);
          }
        }
      }

      await stampGalleries(admin, company.id, [...touched]);
    } catch (e) {
      result.error = e instanceof Error ? e.message.slice(0, 300) : "The orders could not be read.";
    }

    Object.assign(result, counts, { historyFrom: nextFrom, historyDone });
    await admin.from("captura_order_sync").upsert({
      company_id: company.id,
      next_from: nextFrom,
      next_start: nextStart,
      history_done: historyDone,
      last_run_at: new Date().toISOString(),
      last_error: result.error,
      last_counts: counts,
    });
  }
  return results;
}
