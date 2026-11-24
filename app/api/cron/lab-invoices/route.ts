import { NextResponse, type NextRequest } from "next/server";
import { isCronCall } from "@/lib/cron/auth";
import { recordIntegrationRuns } from "@/lib/integrations/status";
import { runLabInvoiceSync } from "@/lib/lab/sync";

// Vercel Cron calls this twice an hour. It picks up the lab's invoice emails
// for companies whose lab.invoices_enabled setting is true: reads the PDFs,
// files them in the company's Drive folder and stores the invoices. It sends
// nothing and changes nothing in Gmail. The answer carries counts only.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isCronCall(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const results = await runLabInvoiceSync();
    await recordIntegrationRuns("google_drive", results);
    return NextResponse.json({
      ok: results.every((r) => !r.error),
      mailboxes: results.map((r) => ({ found: r.found, stored: r.stored, unread: r.unread, matched: r.matched, partial: r.partial, failed: !!r.error })),
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
