import { NextResponse, type NextRequest } from "next/server";
import { isCronCall } from "@/lib/cron/auth";
import { recordIntegrationRuns } from "@/lib/integrations/status";
import { runSupportSync } from "@/lib/support/sync";

// Vercel Cron calls this every ten minutes. It reads new mail from the
// support mailbox into the support desk for companies whose
// support.sync_enabled setting is true. It sends nothing and changes nothing
// in Gmail. The answer carries counts only, never mail.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isCronCall(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const results = await runSupportSync();
    await recordIntegrationRuns("gmail", results);
    return NextResponse.json({
      ok: results.every((r) => !r.error),
      mailboxes: results.map((r) => ({ threads: r.threads, conversations: r.conversations, messages: r.messages, partial: r.partial, failed: !!r.error })),
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
