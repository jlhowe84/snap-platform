import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runClock } from "@/lib/clock/run";

// Vercel Cron calls this once a day with "Authorization: Bearer $CRON_SECRET".
// With no secret set the route refuses every call. It releases lapsed holds
// and queues drafts; it sends nothing.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  const ok =
    !!secret && secret.length >= 16 && given.length === expected.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const results = await runClock();
    return NextResponse.json({
      ok: results.every((r) => r.errors.length === 0),
      companies: results.map((r) => ({ today: r.today, due: r.due, queued: r.queued, errors: r.errors.length })),
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
