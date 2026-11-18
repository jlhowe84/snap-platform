import "server-only";

import { z } from "zod";
import { hasAnyRole, OFFICE_ROLES, requirePortalViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * The job behind a portal step, read as the signed-in person so RLS decides
 * whether they may see it. `office` is staff who may edit; a coordinator's
 * own writes are checked again by the database on every statement.
 */
export async function portalJob(jobId: string) {
  const viewer = await requirePortalViewer();
  if (!z.uuid().safeParse(jobId).success) return null;
  const supabase = await createClient();
  const [{ data: job }, { data: signature }] = await Promise.all([
    supabase.from("jobs").select("id, name, status, company_id").eq("id", jobId).maybeSingle(),
    supabase.from("agreement_signatures").select("id").eq("job_id", jobId).limit(1).maybeSingle(),
  ]);
  if (!job) return null;
  const office = viewer.staff && hasAnyRole(viewer, OFFICE_ROLES);
  const closed = job.status === "released" || job.status === "cancelled";
  return {
    viewer,
    supabase,
    job,
    office,
    signed: !!signature,
    /** May this person change the planning steps right now? */
    canEdit: !closed && (office || (!viewer.staff && !!signature)),
  };
}
