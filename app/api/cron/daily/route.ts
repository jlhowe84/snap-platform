import { NextResponse, type NextRequest } from "next/server";
import { isCronCall } from "@/lib/cron/auth";
import { runClock } from "@/lib/clock/run";
import { runMakeupReminders, runParentReminders } from "@/lib/makeups/reminders";
import { liveSiteUrl } from "@/lib/site-url";

// Vercel Cron calls this once a day with "Authorization: Bearer $CRON_SECRET".
// With no secret set the route refuses every call. It releases lapsed holds
// and queues drafts, which send nothing. It also reminds the office of the
// day's makeup and retake sessions (a notice, and an email through the mail
// guard when the schedule asks for one), and reminds parents of tomorrow's
// sessions by email, through the same guard.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const ok = isCronCall(request);
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // The reminder stands on its own: a problem in it must not stop the clock.
  const makeups = await runMakeupReminders(liveSiteUrl(request.headers)).catch(() => null);

  const parents = await runParentReminders(liveSiteUrl(request.headers)).catch(() => null);

  try {
    const results = await runClock();
    return NextResponse.json({
      ok: results.every((r) => r.errors.length === 0) && makeups !== null && parents !== null,
      makeups: makeups?.reduce((n, m) => n + m.reminded, 0) ?? null,
      parentReminders: parents?.reduce((n, m) => n + m.sent, 0) ?? null,
      companies: results.map((r) => ({ today: r.today, due: r.due, queued: r.queued, errors: r.errors.length })),
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
