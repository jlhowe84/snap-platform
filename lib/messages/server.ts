import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { MESSAGE_SETTING_KEYS, type SavedMessages } from "./catalog";

/**
 * A company's own wording for the platform's emails, by setting key. With the
 * signed-in person's client RLS already limits the rows to their company; a
 * server job with the service role names the company.
 */
export async function savedMessages(client: SupabaseClient<Database>, companyId?: string | null): Promise<SavedMessages> {
  let q = client.from("settings").select("key, value").in("key", MESSAGE_SETTING_KEYS);
  if (companyId) q = q.eq("company_id", companyId);
  const { data } = await q;
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
}
