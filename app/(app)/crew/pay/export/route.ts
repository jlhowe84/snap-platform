import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ADMIN_ROLES, getViewer, hasAnyRole } from "@/lib/auth";
import { payCsv } from "@/lib/staffing/pay";
import { loadPayLines } from "../load";

// The payroll report as a CSV file for the person who runs payroll.
export async function GET(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer?.companyId || !hasAnyRole(viewer, ADMIN_ROLES)) return new NextResponse("Not allowed", { status: 403 });
  const p = req.nextUrl.searchParams;
  const r = z.object({ from: z.iso.date(), to: z.iso.date() }).safeParse({ from: p.get("from"), to: p.get("to") });
  if (!r.success || r.data.from > r.data.to) return new NextResponse("Choose a start and end date", { status: 400 });
  const { lines, error } = await loadPayLines(r.data.from, r.data.to);
  if (error) return new NextResponse("Could not load pay", { status: 500 });
  return new NextResponse(payCsv(lines), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="payroll-${r.data.from}-to-${r.data.to}.csv"`,
      "cache-control": "no-store",
    },
  });
}
