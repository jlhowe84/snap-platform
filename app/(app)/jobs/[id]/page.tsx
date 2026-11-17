import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill, ReadinessStrip, StatusDot } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/dates";
import { seasonForDate } from "@/lib/season";
import { DELIVERY_LABEL, STAGES, STAGE_LABEL, STATUS_LABEL, STATUS_TONE } from "@/lib/labels";

export default async function JobPage({ params }: PageProps<"/jobs/[id]">) {
  await requireStaff();
  const { id } = await params;
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("jobs")
    .select("*, organizations(id, name)")
    .eq("id", id)
    .maybeSingle();
  if (!job) notFound();

  const [{ data: days }, { data: links }, { data: contacts }, { data: tasks }] = await Promise.all([
    supabase.from("photo_days").select("*").eq("job_id", id).order("date").order("start_time"),
    supabase.from("job_links").select("*").eq("job_id", id).maybeSingle(),
    supabase.from("job_contacts").select("role, contacts(id, full_name, email, phone)").eq("job_id", id),
    supabase.from("tasks").select("id, title, status, due_on").eq("job_id", id).order("due_on"),
  ]);

  const season = seasonForDate(days?.[0]?.date);
  const stageIndex = job.production_stage ? STAGES.indexOf(job.production_stage) : -1;

  return (
    <>
      <PageHeader eyebrow={[season, job.organizations?.name].filter(Boolean).join(" · ") || "Job"} title={job.name}>
        <StatusDot tone={STATUS_TONE[job.status]} label={STATUS_LABEL[job.status]} />
      </PageHeader>

      {stageIndex >= 0 && (
        <Card className="mb-6" title="Production">
          <ReadinessStrip steps={STAGES.map((s) => STAGE_LABEL[s])} current={stageIndex} />
          <p className="mt-2 text-sm text-muted">Current stage: {STAGE_LABEL[job.production_stage!]}</p>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title={`Photo days (${days?.length ?? 0})`}>
            {days?.length ? (
              <ul className="divide-y divide-line">
                {days.map((d) => (
                  <li key={d.id} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium">
                        {formatDate(d.date, { weekday: true })}
                        {d.label ? <span className="text-muted"> · {d.label}</span> : null}
                      </p>
                      <p className="text-sm text-muted">
                        {[formatTime(d.start_time), formatTime(d.end_time)].filter(Boolean).join(" to ") || "Time to confirm"}
                      </p>
                    </div>
                    <p className="text-sm text-muted">
                      {[d.location_name, d.address, d.city, d.state].filter(Boolean).join(", ") || "Location to confirm"}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {d.indoor === true && <Pill tone="info">Indoor</Pill>}
                      {d.indoor === false && <Pill>Outdoor</Pill>}
                      {d.alt_indoor_location && <Pill>Rain plan: {d.alt_indoor_location}</Pill>}
                      {d.original_date && d.original_date !== d.date && (
                        <Pill tone="warn">Moved from {formatDate(d.original_date)}</Pill>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No photo days yet.</Empty>
            )}
          </Card>

          <Card title="Tasks">
            {tasks?.length ? (
              <ul className="divide-y divide-line">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                    <span>{t.title}</span>
                    <span className="text-muted">{t.due_on ? formatDate(t.due_on) : t.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No tasks yet. Playbook tasks start in Phase 1.</Empty>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Details">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <Detail label="League">
                {job.organizations ? (
                  <Link className="hover:text-accent" href={`/leagues/${job.organizations.id}`}>
                    {job.organizations.name}
                  </Link>
                ) : (
                  "Not linked yet"
                )}
              </Detail>
              <Detail label="Type">{job.job_type}</Detail>
              <Detail label="Sports">{job.sports.join(", ") || "None"}</Detail>
              <Detail label="Teams">{job.expected_teams ?? "Unknown"}</Detail>
              <Detail label="Subjects">{job.expected_subjects ?? "Unknown"}</Detail>
              <Detail label="Delivery">{job.delivery_method ? DELIVERY_LABEL[job.delivery_method] : "Not set"}</Detail>
              <Detail label="Team photo">{job.team_photo_type ?? "Not set"}</Detail>
              <Detail label="Sponsors">{job.sponsors == null ? "Unknown" : job.sponsors ? "Yes" : "No"}</Detail>
              {job.promo && <Detail label="Promo">{job.promo}</Detail>}
              {job.imported_planning_stage && <Detail label="Notion stage">{job.imported_planning_stage}</Detail>}
            </dl>
          </Card>

          <Card title="Links">
            <ul className="space-y-2 text-sm">
              <LinkRow label="Captura gallery" value={links?.captura_gallery_id ? String(links.captura_gallery_id) : null} />
              <LinkRow label="Online shop" href={links?.online_shop_url} />
              <LinkRow label="Notion page" href={links?.notion_page_url} />
              <LinkRow label="Drive folder" href={links?.drive_folder_url} />
            </ul>
          </Card>

          <Card title="Contacts">
            {contacts?.length ? (
              <ul className="space-y-3 text-sm">
                {contacts.map((c) => {
                  const p = c.contacts as { id: string; full_name: string; email: string | null; phone: string | null } | null;
                  return (
                    <li key={p?.id ?? c.role}>
                      <p className="font-medium">{p?.full_name}</p>
                      <p className="text-muted">{[c.role, p?.email, p?.phone].filter(Boolean).join(" · ")}</p>
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

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function LinkRow({ label, href, value }: { label: string; href?: string | null; value?: string | null }) {
  return (
    <li className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="truncate text-accent hover:underline">
          Open
        </a>
      ) : (
        <span>{value ?? "None"}</span>
      )}
    </li>
  );
}
