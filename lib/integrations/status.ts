import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

type Run = { company: string; error: string | null };

// The scheduled syncs report here so Settings, Integrations shows when each
// connection last worked. One row per company and integration: a clean run
// stamps the success time and clears the error, a failed run keeps the last
// success and stores the error. A recording failure never fails the sync.
export async function recordIntegrationRuns(integration: string, runs: Run[]) {
  const byCompany = new Map<string, string | null>();
  for (const r of runs) {
    byCompany.set(r.company, byCompany.get(r.company) ?? r.error);
  }
  if (!byCompany.size) return;
  const admin = createAdminClient();
  const now = new Date().toISOString();
  for (const [company, error] of byCompany) {
    try {
      await admin.from("integration_status").upsert(
        error
          ? { company_id: company, integration, last_error_at: now, last_error: error.slice(0, 300) }
          : { company_id: company, integration, enabled: true, last_success_at: now, last_error: null },
      );
    } catch {
      // Status is a convenience; the sync result stands on its own.
    }
  }
}
