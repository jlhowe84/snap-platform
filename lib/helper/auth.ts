import "server-only";

import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashHelperKey, looksLikeHelperKey } from "./evidence";

// The iMac helper signs in with its key in the Authorization header. A
// revoked or unknown key is refused. The server then works with the service
// role, always for that device's company only.

export type HelperDevice = { id: string; company_id: string; created_at: string };

export async function helperFrom(request: NextRequest): Promise<HelperDevice | null> {
  const header = request.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!looksLikeHelperKey(key)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("helper_devices")
    .select("id, company_id, created_at, revoked_at")
    .eq("token_hash", hashHelperKey(key))
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  return { id: data.id, company_id: data.company_id, created_at: data.created_at };
}
