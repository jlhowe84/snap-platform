import { NextResponse, type NextRequest } from "next/server";
import { isCronCall } from "@/lib/cron/auth";
import { recordIntegrationRuns } from "@/lib/integrations/status";
import { runOrderSync } from "@/lib/orders/sync";

// Vercel Cron calls this four times a day. It reads Captura orders into the
// ledger for companies whose orders.sync_enabled setting is true. It only
// reads Captura. The answer carries counts only.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isCronCall(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const results = await runOrderSync();
    await recordIntegrationRuns("captura", results);
    return NextResponse.json({
      ok: results.every((r) => !r.error),
      companies: results.map((r) => ({ orders: r.orders, pages: r.pages, galleries: r.galleries, historyDone: r.historyDone, failed: !!r.error })),
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
