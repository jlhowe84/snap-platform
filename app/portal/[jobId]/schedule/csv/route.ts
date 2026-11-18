import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scheduleCsv, type Slot } from "@/lib/schedule/layout";

// Schedule export. Every read runs as the signed-in person, so RLS decides
// (staff and this job's coordinators).
export async function GET(request: NextRequest, ctx: RouteContext<"/portal/[jobId]/schedule/csv">) {
  const { jobId } = await ctx.params;
  const dayId = request.nextUrl.searchParams.get("day") ?? "";
  const supabase = await createClient();
  const { data: day } = await supabase.from("photo_days").select("id, date").eq("id", dayId).eq("job_id", jobId).maybeSingle();
  if (!day) return new NextResponse("Not found", { status: 404 });

  const { data: schedule } = await supabase.from("schedules").select("id").eq("photo_day_id", day.id).maybeSingle();
  const [{ data: slots }, { data: teams }] = await Promise.all([
    schedule
      ? supabase.from("schedule_slots").select("station, starts_at, minutes, kind, team_id, label").eq("schedule_id", schedule.id)
      : Promise.resolve({ data: [] }),
    supabase.from("teams").select("id, name, division, coach_name, tc_number").eq("job_id", jobId),
  ]);

  return new NextResponse(scheduleCsv((slots ?? []) as Slot[], teams ?? [], day.date), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="schedule-${day.date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
