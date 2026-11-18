import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { agreementDownloadUrl, fileAgreementPdf } from "@/lib/agreement/file";

// Signed agreement download. The read below runs as the signed-in person, so
// RLS decides whether they may have it (the job's coordinators and staff);
// only then does the server hand out a five-minute link to the private file.
export async function GET(_request: NextRequest, ctx: RouteContext<"/portal/[jobId]/agreement/pdf">) {
  const { jobId } = await ctx.params;
  const supabase = await createClient();
  const { data: signature } = await supabase
    .from("agreement_signatures")
    .select("id, pdf_path")
    .eq("job_id", jobId)
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!signature) return new NextResponse("Not found", { status: 404 });

  const path = signature.pdf_path ?? (await fileAgreementPdf(signature.id));
  return NextResponse.redirect(await agreementDownloadUrl(path));
}
