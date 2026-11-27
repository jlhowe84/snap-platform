import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayIn } from "@/lib/dates";
import { helperFrom } from "@/lib/helper/auth";
import { helperJobs } from "@/lib/helper/evidence";

// The iMac helper asks here each run which job folders to make and which to
// count. It gets job ids and folder names only.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const device = await helperFrom(request);
  if (!device) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data: company } = await admin.from("companies").select("time_zone").eq("id", device.company_id).single();
  const [{ data: rows, error }, { data: evidence }] = await Promise.all([
    admin
      .from("jobs")
      .select("id, name, status, nas_folder, production_started_at, photo_days(date)")
      .eq("company_id", device.company_id)
      .in("status", ["in_production", "at_lab", "delivered"])
      .limit(1000),
    admin.from("job_folder_evidence").select("job_id, import_done_at, upload_done_at").eq("company_id", device.company_id),
  ]);
  if (error) return NextResponse.json({ error: "could not list jobs" }, { status: 500 });
  const jobs = helperJobs(
    (rows ?? []).map((r) => ({ ...r, days: (r.photo_days ?? []).map((d) => d.date) })),
    new Map((evidence ?? []).map((e) => [e.job_id, e])),
    { connectedAt: device.created_at, today: todayIn(company?.time_zone ?? "America/New_York") },
  );
  await admin.from("helper_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);
  return NextResponse.json({ jobs });
}
