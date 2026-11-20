import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff, hasAnyRole, OFFICE_ROLES } from "@/lib/auth";
import { MoneyTermsForm } from "./terms-form";
import { MoneyTermsList } from "@/components/money-terms";
import { createClient } from "@/lib/supabase/server";
import { ButtonLink, Card, Empty, PageHeader, Pill, StatusDot } from "@/components/ui";
import { formatDate, formatRange } from "@/lib/dates";
import { OFFER_STAGE_LABEL, STATUS_LABEL, STATUS_TONE } from "@/lib/labels";

const CHANNEL_LABEL: Record<string, string> = {
  email: "email", call: "call", text: "text", portal: "portal", meeting: "meeting", note: "note",
};

export default async function LeaguePage({ params }: PageProps<"/leagues/[id]">) {
  const viewer = await requireStaff([...OFFICE_ROLES, "support"]);
  const office = hasAnyRole(viewer, OFFICE_ROLES);
  const { id } = await params;
  const supabase = await createClient();

  const { data: org } = await supabase.from("organizations").select("*").eq("id", id).maybeSingle();
  if (!org) notFound();

  const [{ data: jobs }, { data: people }, { data: offers }, { data: timeline }, { data: terms }] = await Promise.all([
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
    supabase
      .from("season_offers")
      .select("id, season, stage, tier, priority_rank")
      .eq("org_id", id)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("touchpoints")
      .select("id, channel, direction, summary, actor_kind, occurred_at, profiles(full_name), contacts(full_name)")
      .eq("org_id", id)
      .order("occurred_at", { ascending: false })
      .limit(25),
    supabase
      .from("organization_terms")
      .select("sponsorship, rebate, parent_discount, other_terms")
      .eq("org_id", id)
      .maybeSingle(),
  ]);
  const money = terms ?? { sponsorship: null, rebate: null, parent_discount: null, other_terms: null };

  return (
    <>
      <PageHeader eyebrow={org.relationship ?? "League"} title={org.name}>
        {!org.active && <Pill tone="warn">Inactive</Pill>}
        <ButtonLink href={`/jobs/new?org=${org.id}`} variant="ghost">New job</ButtonLink>
      </PageHeader>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
        <Card title={`Jobs (${jobs?.length ?? 0})`}>
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
        <Card title="Timeline">
          {timeline?.length ? (
            <ol className="space-y-3 text-sm">
              {timeline.map((t) => {
                const who =
                  t.actor_kind === "system"
                    ? "Platform"
                    : t.actor_kind === "agent"
                      ? "SNAP agent"
                      : t.actor_kind === "contact"
                        ? ((t.contacts as { full_name: string } | null)?.full_name ?? "League contact")
                        : ((t.profiles as { full_name: string | null } | null)?.full_name ?? "Staff");
                return (
                  <li key={t.id} className="flex gap-3">
                    <span className="w-24 shrink-0 text-xs text-muted">{formatDate(t.occurred_at.slice(0, 10))}</span>
                    <span>
                      {t.summary}
                      <span className="text-xs text-muted"> · {who}, {CHANNEL_LABEL[t.channel] ?? t.channel}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <Empty>Nothing logged yet. Holds, signatures, calls and emails show here.</Empty>
          )}
        </Card>
        </div>
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
          <Card title="Money terms">
            <p className="mb-3 text-xs text-muted">
              Agreed with this league only. Kept out of the standard agreement and shown on each of its jobs.
            </p>
            {office ? <MoneyTermsForm orgId={id} terms={money} /> : <MoneyTermsList terms={money} />}
          </Card>
          <Card title="Season offers">
            {offers?.length ? (
              <ul className="space-y-2 text-sm">
                {offers.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2">
                    <Link href={`/season?season=${encodeURIComponent(o.season)}`} className="hover:text-accent">
                      {o.season}
                    </Link>
                    <span className="flex items-center gap-2">
                      {o.tier === "top" && <Pill tone="accent">Top tier</Pill>}
                      <Pill>{OFFER_STAGE_LABEL[o.stage]}</Pill>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Not on a season board yet.</Empty>
            )}
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
