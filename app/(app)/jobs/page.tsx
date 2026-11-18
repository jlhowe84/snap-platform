import type { Metadata } from "next";
import Link from "next/link";
import { hasAnyRole, OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ButtonLink, Card, Empty, PageHeader, Pill, ReadinessStrip, StatusDot } from "@/components/ui";
import { formatRange } from "@/lib/dates";
import { seasonSortKey } from "@/lib/season";
import { STAGES, STAGE_LABEL, STATUS_LABEL, STATUS_TONE } from "@/lib/labels";

export const metadata: Metadata = { title: "Jobs" };

export default async function JobsPage({ searchParams }: PageProps<"/jobs">) {
  const viewer = await requireStaff();
  const office = hasAnyRole(viewer, OFFICE_ROLES);
  const params = await searchParams;
  const season = typeof params.season === "string" ? params.season : null;
  const q = typeof params.q === "string" ? params.q.trim() : "";

  const supabase = await createClient();
  const { data: seasonRows } = await supabase.from("job_overview").select("season");
  const seasons = [...new Set((seasonRows ?? []).map((r) => r.season ?? "No date yet"))].sort(
    (a, b) => seasonSortKey(b) - seasonSortKey(a),
  );

  let query = supabase
    .from("job_overview")
    .select("id, name, org_name, season, first_date, last_date, photo_day_count, status, production_stage, sports")
    .order("first_date", { ascending: true, nullsFirst: false });
  if (season === "No date yet") query = query.is("season", null);
  else if (season) query = query.eq("season", season);
  if (q) query = query.or(`name.ilike.%${q.replace(/[%,()]/g, "")}%,org_name.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const { data: jobs, error } = await query;

  return (
    <>
      <PageHeader eyebrow="Production" title={season ?? "All jobs"}>
        <form className="flex gap-2">
          {season && <input type="hidden" name="season" value={season} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search jobs or leagues"
            className="w-56 rounded-lg border border-line bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </form>
        {office && <ButtonLink href="/jobs/new">New job</ButtonLink>}
      </PageHeader>

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Seasons">
        <SeasonTab href="/jobs" active={!season} label="All" />
        {seasons.map((s) => (
          <SeasonTab key={s} href={`/jobs?season=${encodeURIComponent(s)}`} active={season === s} label={s} />
        ))}
      </nav>

      <Card>
        {error ? (
          <Empty>Could not load jobs: {error.message}</Empty>
        ) : !jobs?.length ? (
          <Empty>No jobs match.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {jobs.map((j) => {
              const stageIndex = j.production_stage ? STAGES.indexOf(j.production_stage) : -1;
              return (
                <li key={j.id}>
                  <Link
                    href={`/jobs/${j.id}`}
                    className="grid gap-2 px-2 py-3 hover:bg-surface-2 md:grid-cols-[2fr_1.3fr_1fr_1fr] md:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{j.name}</p>
                      <p className="truncate text-sm text-muted">{j.org_name ?? "League not linked yet"}</p>
                    </div>
                    <div className="text-sm">
                      <p>{formatRange(j.first_date, j.last_date)}</p>
                      <p className="text-muted">
                        {j.photo_day_count ?? 0} photo day{j.photo_day_count === 1 ? "" : "s"}
                        {j.sports?.length ? ` · ${j.sports.join(", ")}` : ""}
                      </p>
                    </div>
                    <div>{j.status && <StatusDot tone={STATUS_TONE[j.status]} label={STATUS_LABEL[j.status]} />}</div>
                    <div className="space-y-1">
                      {stageIndex >= 0 ? (
                        <>
                          <ReadinessStrip steps={STAGES.map((s) => STAGE_LABEL[s])} current={stageIndex} />
                          <p className="text-xs text-muted">{STAGE_LABEL[j.production_stage!]}</p>
                        </>
                      ) : (
                        <Pill>{j.season ?? "No date yet"}</Pill>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <p className="mt-3 text-sm text-muted">{jobs?.length ?? 0} jobs</p>
    </>
  );
}

function SeasonTab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={
        "rounded-full border px-3 py-1 text-sm " +
        (active ? "border-accent bg-accent text-accent-ink" : "border-line text-muted hover:text-text")
      }
    >
      {label}
    </Link>
  );
}
