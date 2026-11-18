import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rosterDownloadUrl } from "@/lib/rosters/files";

// Roster download. The read below runs as the signed-in person, so RLS
// decides whether they may have it (staff and this job's coordinators); only
// then does the server hand out a five-minute link to the private file.
export async function GET(_request: NextRequest, ctx: RouteContext<"/portal/[jobId]/rosters/[fileId]">) {
  const { jobId, fileId } = await ctx.params;
  const supabase = await createClient();
  const { data: file } = await supabase
    .from("roster_files")
    .select("storage_path, file_name")
    .eq("id", fileId)
    .eq("job_id", jobId)
    .maybeSingle();
  if (!file) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(await rosterDownloadUrl(file.storage_path, file.file_name));
}
