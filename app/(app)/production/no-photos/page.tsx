import type { Metadata } from "next";
import Link from "next/link";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { CASE_WAITING } from "@/lib/production/no-photos";
import { loadOfferStates } from "@/lib/production/offer-state";
import { CaseList, type CaseRow } from "./case-list";

export const metadata: Metadata = { title: "Orders with no photos" };

/**
 * Every prepay order whose player has no photos, across jobs: the list the
 * office works to a makeup or a refund. The check itself runs from a job's page.
 */
export default async function NoPhotosPage({ searchParams }: PageProps<"/production/no-photos">) {
  const showAll = (await searchParams).all === "1";
  await requireStaff(OFFICE_ROLES);
  const supabase = await createClient();
  const { data } = await supabase
    .from("prepay_photo_cases")
    .select("id, order_id, reason, player, team, order_date, total, status, note, cleared_at, job_id, jobs(name)")
    .order("first_seen_at", { ascending: false })
    .limit(2000);
  const rows = data ?? [];
  const offers = rows.length ? await loadOfferStates(supabase) : {};
  const waiting = rows.filter((r) => !r.cleared_at && (CASE_WAITING as readonly string[]).includes(r.status));
  const shown = showAll ? rows : waiting;

  const byJob = new Map<string, { name: string; jobId: string | null; cases: CaseRow[] }>();
  for (const r of shown) {
    const key = r.job_id ?? "none";
    const group = byJob.get(key) ?? { name: r.jobs?.name ?? "Job removed", jobId: r.job_id, cases: [] };
    group.cases.push(r);
    byJob.set(key, group);
  }
  const count = (s: string) => waiting.filter((r) => r.status === s).length;

  return (
    <>
      <PageHeader back={{ href: "/production", label: "Production" }} eyebrow="Production" title="Orders with no photos">
        <Link
          href={showAll ? "/production/no-photos" : "/production/no-photos?all=1"}
          className="flex min-h-12 items-center rounded-lg border border-line px-3 text-sm font-semibold hover:border-accent hover:text-accent sm:min-h-0 sm:py-1.5"
        >
          {showAll ? "Show only what is waiting" : "Show finished too"}
        </Link>
      </PageHeader>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="To do" value={count("open")} hint="No makeup offered yet" />
        <Stat label="Makeup offered" value={count("offered")} hint="Waiting on the parent" />
        <Stat label="Makeup booked" value={count("makeup_booked")} hint="Photos still to come" />
      </div>

      {byJob.size ? (
        <div className="grid grid-cols-1 gap-6">
          {[...byJob.values()].map((g) => (
            <Card
              key={g.jobId ?? "none"}
              title={`${g.name} (${g.cases.length})`}
              action={g.jobId ? <Link href={`/jobs/${g.jobId}#nophotos`} className="text-sm text-accent hover:underline">Open job</Link> : undefined}
            >
              <CaseList cases={g.cases} offers={offers} />
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <Empty>
            {rows.length ? "Nothing is waiting." : "Nothing listed yet. Open a job with a Captura gallery and run the check there once its images are assigned."}
          </Empty>
        </Card>
      )}
      <p className="mt-4 text-xs text-muted">
        The check reads Captura and lists orders; it sends nothing. A makeup offer is drafted here and waits in the approval queue; refunds are done by a person.
      </p>
    </>
  );
}
