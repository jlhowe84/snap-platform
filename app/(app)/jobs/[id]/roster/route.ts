import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { rosterDownloadUrl } from "@/lib/rosters/files";

// The current finished roster of a job, for the Captura upload step. Staff
// only: the file holds parent contact details the league's own coordinators
// never see in this shape. The row is read as the signed-in person first.
export async function GET(_request: NextRequest, ctx: RouteContext<"/jobs/[id]/roster">) {
  await requireStaff();
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const [{ data: job }, { data: version }] = await Promise.all([
    supabase.from("jobs").select("name, organizations(name)").eq("id", id).maybeSingle(),
    supabase
      .from("roster_versions")
      .select("csv_path")
      .eq("job_id", id)
      .in("status", ["ready", "uploaded"])
      .not("csv_path", "is", null)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!job || !version?.csv_path) return new NextResponse("Not found", { status: 404 });
  const org = (job.organizations?.name ?? job.name).replace(/[\\/:*?"<>|]+/g, " ").trim();
  return NextResponse.redirect(await rosterDownloadUrl(version.csv_path, `SNAP Roster _ Schedule for ${org} - Roster.csv`));
}
