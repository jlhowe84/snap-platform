import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff, hasAnyRole, OFFICE_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill, ReadinessStrip, StatusDot } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/dates";
import { MoneyTermsList } from "@/components/money-terms";
import { seasonForDate } from "@/lib/season";
import { DELIVERY_LABEL, STAGES, STAGE_LABEL, STATUS_LABEL, STATUS_TONE } from "@/lib/labels";
import { answerRows, readAnswers } from "@/lib/planning/form";
import { formatBytes, ROSTER_TYPES } from "@/lib/rosters/types";
import { toClock, toMinutes } from "@/lib/schedule/layout";
import { PortalLinkForm } from "./portal-link-form";
import { StandardRosterUpload } from "./standard-roster";
import { revokePortalLink } from "./portal-actions";

const READY: Record<string, string> = {
  not_sent: "not sent", sent: "sent", submitted: "submitted",
  not_received: "not received", received: "received", standardized: "standardized", uploaded: "in Captura",
  not_started: "not started", link_sent: "link sent", started: "started", complete: "complete",
};
const CHASE: Record<string, string> = {
  "chase.request": "Request", "chase.reminder": "Reminder", "chase.due_soon": "Due in one week",
  "chase.at_risk": "Date at risk", "chase.call": "Call task",
};
const CHASE_OUTCOME: Record<string, string> = {
  queued: "drafted", skipped: "skipped", not_needed: "not needed", task: "created", released: "released",
};

export default async function JobPage({ params }: PageProps<"/jobs/[id]">) {
  const viewer = await requireStaff();
  const office = hasAnyRole(viewer, OFFICE_ROLES);
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
  const [{ data: holds }, { data: signatures }, { data: portalLinks }] = await Promise.all([
    supabase.from("date_holds").select("photo_day_id, status, expires_on").eq("job_id", id),
    supabase.from("agreement_signatures").select("id, signer_name, signed_at").eq("job_id", id).order("signed_at", { ascending: false }),
    supabase
      .from("portal_links")
      .select("id, created_at, expires_at, last_used_at, revoked_at, contacts(full_name)")
      .eq("job_id", id)
      .order("created_at", { ascending: false }),
  ]);
  const [{ data: moneyTerms }, { data: minSetting }, { data: readiness }, { data: clock }] = await Promise.all([
    job.org_id
      ? supabase.from("organization_terms").select("sponsorship, rebate, parent_discount, other_terms").eq("org_id", job.org_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("settings").select("value").eq("key", "photo_day.min_players").maybeSingle(),
    supabase.from("photo_day_readiness").select("*").eq("job_id", id).order("date"),
    supabase.from("clock_log").select("id, kind, outcome, run_on").eq("job_id", id).like("kind", "chase.%").order("created_at"),
  ]);
  const [{ data: planningForm }, { data: rosterFiles }, { count: teamCount }, { data: finishedRoster }] = await Promise.all([
    supabase.from("planning_forms").select("answers, submitted_at").eq("job_id", id).maybeSingle(),
    supabase.from("roster_files").select("id, file_name, mime_type, size_bytes, source, uploaded_at").eq("job_id", id).order("uploaded_at", { ascending: false }),
    supabase.from("teams").select("id", { count: "exact", head: true }).eq("job_id", id),
    supabase
      .from("roster_versions")
      .select("version, status, subject_count, team_count, created_at")
      .eq("job_id", id)
      .in("status", ["ready", "uploaded"])
      .not("csv_path", "is", null)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const [{ data: schedules }, { data: scheduleSlots }, { data: scheduleTeams }] = await Promise.all([
    supabase.from("schedules").select("id, photo_day_id, status, stations").eq("job_id", id),
    supabase.from("schedule_slots").select("id, schedule_id, station, starts_at, minutes, kind, team_id, label").eq("job_id", id),
    supabase.from("teams").select("id, name, division, coach_name").eq("job_id", id),
  ]);
  const teamById = new Map((scheduleTeams ?? []).map((t) => [t.id, t]));
  const planningRows = answerRows(readAnswers(planningForm?.answers));
  const emailContacts = (contacts ?? [])
    .map((c) => c.contacts as { id: string; full_name: string; email: string | null } | null)
    .filter((c): c is { id: string; full_name: string; email: string } => !!c?.email)
    .map((c) => ({ id: c.id, name: c.full_name, email: c.email }));
  const nowIso = new Date().toISOString();
  const minPlayers = typeof minSetting?.value === "number" ? minSetting.value : 50;

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

          <Card title="Planning readiness">
            {readiness?.length ? (
              <ul className="space-y-3 text-sm">
                {readiness.map((r) => (
                  <li key={r.photo_day_id} className="flex flex-wrap items-center gap-2">
                    <span className="w-28 text-muted">{formatDate(r.date)}</span>
                    <Pill tone={r.agreement_signed ? "ok" : "warn"}>Agreement {r.agreement_signed ? "signed" : "not signed"}</Pill>
                    <Pill tone={r.planning_form === "submitted" ? "ok" : "warn"}>Form {READY[r.planning_form ?? ""] ?? r.planning_form}</Pill>
                    <Pill tone={r.roster === "not_received" ? "warn" : "ok"}>Roster {READY[r.roster ?? ""] ?? r.roster}</Pill>
                    <Pill tone={r.schedule === "submitted" || r.schedule === "complete" ? "ok" : "warn"}>
                      Schedule {READY[r.schedule ?? ""] ?? r.schedule}
                    </Pill>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No photo day yet.</Empty>
            )}
            {clock && clock.length > 0 && (
              <p className="mt-3 text-xs text-muted">
                Chase so far:{" "}
                {clock.map((c) => `${CHASE[c.kind] ?? c.kind} ${CHASE_OUTCOME[c.outcome] ?? c.outcome} ${formatDate(c.run_on)}`).join(" · ")}
              </p>
            )}
          </Card>

          <Card
            title="Schedule"
            action={<Link href={`/portal/${id}/schedule`} className="text-sm text-accent hover:underline">Open the scheduler</Link>}
          >
            {schedules?.length ? (
              <div className="space-y-5">
                {(days ?? []).map((d) => {
                  const sc = schedules.find((x) => x.photo_day_id === d.id);
                  if (!sc) return null;
                  const final = sc.status === "submitted" || sc.status === "complete";
                  const rows = (scheduleSlots ?? [])
                    .filter((x) => x.schedule_id === sc.id)
                    .sort((a, b) => toMinutes(a.starts_at) - toMinutes(b.starts_at) || a.station - b.station);
                  return (
                    <section key={sc.id}>
                      <p className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium">{formatDate(d.date, { weekday: true })}</span>
                        <Pill tone={final ? "ok" : "warn"}>
                          {sc.status === "complete" ? "Approved" : sc.status === "submitted" ? "Submitted, waiting for approval" : (READY[sc.status] ?? sc.status)}
                        </Pill>
                        {final && (
                          <a href={`/portal/${id}/schedule/csv?day=${d.id}`} className="text-accent hover:underline">Download CSV</a>
                        )}
                      </p>
                      {final ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead className="text-xs uppercase tracking-wider text-muted">
                              <tr>
                                <th className="py-1 pr-4 font-semibold">Time</th>
                                <th className="py-1 pr-4 font-semibold">Station</th>
                                <th className="py-1 pr-4 font-semibold">Team</th>
                                <th className="py-1 pr-4 font-semibold">Division</th>
                                <th className="py-1 font-semibold">Coach</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line">
                              {rows.map((x) => {
                                const t = x.team_id ? teamById.get(x.team_id) : undefined;
                                return (
                                  <tr key={x.id} className={x.kind === "break" ? "text-muted" : undefined}>
                                    <td className="whitespace-nowrap py-1.5 pr-4">
                                      {formatTime(x.starts_at)} to {formatTime(toClock(toMinutes(x.starts_at) + x.minutes))}
                                    </td>
                                    <td className="py-1.5 pr-4">{x.station}</td>
                                    <td className="py-1.5 pr-4">{x.kind === "break" ? x.label || "Break" : (t?.name ?? x.label ?? "Team removed")}</td>
                                    <td className="py-1.5 pr-4">{t?.division ?? ""}</td>
                                    <td className="py-1.5">{t?.coach_name ?? ""}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-sm text-muted">
                          {rows.length} {rows.length === 1 ? "slot" : "slots"} so far. The full schedule shows here once it is submitted.
                        </p>
                      )}
                    </section>
                  );
                })}
              </div>
            ) : (
              <Empty>No schedule started yet.</Empty>
            )}
          </Card>

          <Card
            title="Planning details"
            action={
              <span className="flex gap-3 text-sm">
                <Link href={`/portal/${id}/planning`} className="text-accent hover:underline">Form</Link>
                <Link href={`/portal/${id}/rosters`} className="text-accent hover:underline">Rosters</Link>
                <Link href={`/portal/${id}/schedule`} className="text-accent hover:underline">Schedule</Link>
              </span>
            }
          >
            {planningRows.length ? (
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
                {planningRows.map((row) => (
                  <div key={row.label} className="contents">
                    <dt className="text-muted">{row.label}</dt>
                    <dd className="whitespace-pre-wrap">{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <Empty>No planning answers yet.</Empty>
            )}
            {planningForm && !planningForm.submitted_at && planningRows.length > 0 && (
              <p className="mt-2 text-xs text-warn">Saved as a draft, not sent yet.</p>
            )}
            <h3 className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wider text-muted">
              Roster files ({rosterFiles?.length ?? 0}) · {teamCount ?? 0} teams
            </h3>
            {rosterFiles?.length ? (
              <ul className="divide-y divide-line text-sm">
                {rosterFiles.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                    <a href={`/portal/${id}/rosters/${f.id}`} className="font-medium text-accent hover:underline">{f.file_name}</a>
                    <span className="text-muted">
                      {ROSTER_TYPES[f.mime_type] ?? "File"} · {formatBytes(f.size_bytes)} · {formatDate(f.uploaded_at.slice(0, 10))} · {f.source}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">None received.</p>
            )}
            <h3 className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wider text-muted">Finished roster</h3>
            {finishedRoster ? (
              <p className="mb-2 text-sm">
                <a href={`/jobs/${id}/roster`} className="font-medium text-accent hover:underline">Download the SNAP roster CSV</a>
                <span className="text-muted">
                  {" "}· version {finishedRoster.version} · {finishedRoster.team_count ?? 0} teams · {finishedRoster.subject_count ?? 0} players ·{" "}
                  {formatDate(finishedRoster.created_at.slice(0, 10))}
                </span>
              </p>
            ) : (
              <p className="mb-2 text-sm text-muted">
                Not uploaded yet. Process the league&apos;s files into the SNAP roster format, then upload the CSV here. Its teams fill the schedule.
              </p>
            )}
            {office && <StandardRosterUpload jobId={id} hasOne={!!finishedRoster} />}
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
              <Detail label="Subjects">
                {job.expected_subjects ?? "Unknown"}
                {job.expected_subjects != null && job.expected_subjects < minPlayers && (
                  <span className="ml-2"><Pill tone="warn">Under the {minPlayers}-player minimum</Pill></span>
                )}
              </Detail>
              <Detail label="Delivery">{job.delivery_method ? DELIVERY_LABEL[job.delivery_method] : "Not set"}</Detail>
              <Detail label="Team photo">{job.team_photo_type ?? "Not set"}</Detail>
              <Detail label="Sponsors">{job.sponsors == null ? "Unknown" : job.sponsors ? "Yes" : "No"}</Detail>
              {job.promo && <Detail label="Promo">{job.promo}</Detail>}
              {job.imported_planning_stage && <Detail label="Notion stage">{job.imported_planning_stage}</Detail>}
            </dl>
          </Card>

          <Card
            title="League money terms"
            action={job.organizations ? <Link href={`/leagues/${job.organizations.id}`} className="text-sm text-accent hover:underline">{office ? "Edit on league" : "League"}</Link> : undefined}
          >
            <MoneyTermsList terms={moneyTerms} />
          </Card>
          <Card title="Booking">
            <ul className="space-y-2 text-sm">
              {(holds ?? []).map((h) => (
                <li key={h.photo_day_id} className="flex justify-between gap-3">
                  <span className="text-muted">Hold</span>
                  <span>
                    {h.status === "held" ? `Held until ${formatDate(h.expires_on)}` : h.status === "confirmed" ? "Confirmed" : "Released"}
                  </span>
                </li>
              ))}
              <li className="flex justify-between gap-3">
                <span className="text-muted">Agreement</span>
                {signatures?.[0] ? (
                  <a href={`/portal/${id}/agreement/pdf`} className="text-accent hover:underline">
                    Signed by {signatures[0].signer_name}, {formatDate(signatures[0].signed_at.slice(0, 10))}
                  </a>
                ) : (
                  <span>Not signed</span>
                )}
              </li>
            </ul>
          </Card>

          <Card title="Coordinator portal" action={<Link href={`/portal/${id}`} className="text-sm text-accent hover:underline">View as staff</Link>}>
            {office && <PortalLinkForm jobId={id} contacts={emailContacts} />}
            {portalLinks?.length ? (
              <ul className="mt-4 divide-y divide-line text-sm">
                {portalLinks.map((l) => {
                  const live = !l.revoked_at && l.expires_at > nowIso;
                  return (
                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div>
                        <p>{(l.contacts as { full_name: string } | null)?.full_name ?? "Contact"}</p>
                        <p className="text-xs text-muted">
                          {l.revoked_at
                            ? `Revoked ${formatDate(l.revoked_at.slice(0, 10))}`
                            : live
                              ? `Open until ${formatDate(l.expires_at.slice(0, 10))}`
                              : "Expired"}
                          {l.last_used_at ? ` · last used ${formatDate(l.last_used_at.slice(0, 10))}` : " · not used yet"}
                        </p>
                      </div>
                      {live && office && (
                        <form action={revokePortalLink.bind(null, id, l.id)}>
                          <button className="text-xs text-risk hover:underline">Revoke</button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : null}
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
