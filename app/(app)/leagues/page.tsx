import type { Metadata } from "next";
import Link from "next/link";
import { hasAnyRole, requireStaff, OFFICE_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ButtonLink, Card, Empty, PageHeader, Pill } from "@/components/ui";

export const metadata: Metadata = { title: "Leagues" };

const FILTERS = ["Spring", "Summer", "Fall", "Winter"] as const;

export default async function LeaguesPage({ searchParams }: PageProps<"/leagues">) {
  const viewer = await requireStaff([...OFFICE_ROLES, "support"]);
  const office = hasAnyRole(viewer, OFFICE_ROLES);
  const params = await searchParams;
  const season = FILTERS.find((f) => f === params.season) ?? null;
  const showAll = params.all === "1";
  const supabase = await createClient();

  let query = supabase
    .from("organizations")
    .select("id, name, org_type, relationship, active, sports, seasons, website, jobs(count)")
    .order("name");
  if (season) query = query.contains("seasons", [season]);
  if (!showAll) query = query.eq("active", true);
  const { data: orgs, error } = await query;

  const qs = (next: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged = { season, all: showAll ? "1" : null, ...next };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/leagues?${s}` : "/leagues";
  };

  return (
    <>
      <PageHeader eyebrow="Jobs" title={season ? `${season} leagues` : "Leagues"}>
        {office && <ButtonLink href="/leagues/new">New league</ButtonLink>}
      </PageHeader>
      <nav className="mb-4 flex flex-wrap gap-2">
        <Tab href={qs({ season: null })} active={!season} label="Any season" />
        {FILTERS.map((f) => (
          <Tab key={f} href={qs({ season: f })} active={season === f} label={f} />
        ))}
        <span className="mx-2 w-px bg-line" />
        <Tab href={qs({ all: showAll ? null : "1" })} active={showAll} label="Include inactive" />
      </nav>
      <Card>
        {error ? (
          <Empty>Could not load leagues: {error.message}</Empty>
        ) : !orgs?.length ? (
          <Empty>No leagues yet. They arrive with the Notion accounts import.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {orgs.map((o) => {
              const jobCount = (o.jobs as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
              return (
                <li key={o.id}>
                  <Link
                    href={`/leagues/${o.id}`}
                    className="grid gap-1 px-2 py-3 hover:bg-surface-2 md:grid-cols-[2fr_1.5fr_1fr_auto] md:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{o.name}</p>
                      <p className="text-sm text-muted">{o.relationship ?? o.org_type}</p>
                    </div>
                    <p className="text-sm text-muted">{o.sports.join(", ") || "No sports listed"}</p>
                    <div className="flex flex-wrap gap-1">
                      {o.seasons.map((s) => (
                        <Pill key={s} tone={s === season ? "accent" : "muted"}>
                          {s}
                        </Pill>
                      ))}
                    </div>
                    <p className="text-sm text-muted">
                      {jobCount} job{jobCount === 1 ? "" : "s"}
                      {!o.active && " · inactive"}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <p className="mt-3 text-sm text-muted">{orgs?.length ?? 0} leagues</p>
    </>
  );
}

function Tab({ href, active, label }: { href: string; active: boolean; label: string }) {
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
