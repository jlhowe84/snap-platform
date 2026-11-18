import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff, OFFICE_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill, StatusDot } from "@/components/ui";
import { formatRange } from "@/lib/dates";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/labels";

export default async function LeaguePage({ params }: PageProps<"/leagues/[id]">) {
  await requireStaff([...OFFICE_ROLES, "support"]);
  const { id } = await params;
  const supabase = await createClient();

  const { data: org } = await supabase.from("organizations").select("*").eq("id", id).maybeSingle();
  if (!org) notFound();

  const [{ data: jobs }, { data: people }] = await Promise.all([
    supabase
      .from("job_overview")
      .select("id, name, season, first_date, last_date, status")
      .eq("org_id", id)
      .order("first_date", { ascending: false, nullsFirst: true }),
    supabase
      .from("organization_contacts")
      .select("id, role, is_primary, contacts(full_name, email, phone, preferred_channel)")
      .eq("org_id", id)
      .is("ended_on", null)
      .order("is_primary", { ascending: false }),
  ]);

  return (
    <>
      <PageHeader eyebrow={org.relationship ?? "League"} title={org.name}>
        {!org.active && <Pill tone="warn">Inactive</Pill>}
      </PageHeader>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title={`Jobs (${jobs?.length ?? 0})`} className="xl:col-span-2">
          {jobs?.length ? (
            <ul className="divide-y divide-line">
              {jobs.map((j) => (
                <li key={j.id}>
                  <Link href={`/jobs/${j.id}`} className="flex flex-wrap items-center justify-between gap-2 px-2 py-3 hover:bg-surface-2">
                    <div>
                      <p className="font-medium">{j.name}</p>
                      <p className="text-sm text-muted">{formatRange(j.first_date, j.last_date)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Pill>{j.season ?? "No date yet"}</Pill>
                      {j.status && <StatusDot tone={STATUS_TONE[j.status]} label={STATUS_LABEL[j.status]} />}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No jobs linked to this league yet.</Empty>
          )}
        </Card>
        <div className="space-y-6">
          <Card title="About">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Sports</dt>
              <dd>{org.sports.join(", ") || "None listed"}</dd>
              <dt className="text-muted">Seasons</dt>
              <dd>{org.seasons.join(", ") || "None listed"}</dd>
              {org.size_note && (
                <>
                  <dt className="text-muted">Size</dt>
                  <dd>{org.size_note}</dd>
                </>
              )}
              {org.website && (
                <>
                  <dt className="text-muted">Website</dt>
                  <dd className="truncate">
                    <a className="text-accent hover:underline" href={org.website} target="_blank" rel="noreferrer">
                      {org.website.replace(/^https?:\/\//, "")}
                    </a>
                  </dd>
                </>
              )}
            </dl>
          </Card>
          <Card title="People">
            {people?.length ? (
              <ul className="space-y-3 text-sm">
                {people.map((p) => {
                  const c = p.contacts as { full_name: string; email: string | null; phone: string | null } | null;
                  return (
                    <li key={p.id}>
                      <p className="font-medium">
                        {c?.full_name} {p.is_primary && <Pill tone="accent">Primary</Pill>}
                      </p>
                      <p className="text-muted">{[p.role, c?.email, c?.phone].filter(Boolean).join(" · ")}</p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty>No contacts linked yet.</Empty>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
