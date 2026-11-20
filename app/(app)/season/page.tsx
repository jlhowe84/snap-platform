import Link from "next/link";
import { requireStaff, hasAnyRole, OFFICE_ROLES, ADMIN_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import { formatDate, todayIn } from "@/lib/dates";
import { equivalentDate, isSeasonLabel, outreachSeason, seasonRange, shiftSeason } from "@/lib/season";
import { extendHold, setOfferStage } from "./actions";
import { BuildBoardButton, DraftOffersButton, HoldForm, ReleaseForm } from "./forms";
import { SubmitButton } from "@/components/submit-button";

type Basis = { subjects?: number | null; teams?: number | null; last_date?: string | null; from_season?: string };

const COLUMNS = [
  { key: "not_offered", title: "To offer" },
  { key: "offered", title: "Offered" },
  { key: "held", title: "Held" },
  { key: "confirmed", title: "Confirmed" },
  { key: "closed", title: "Declined or no reply" },
] as const;

export default async function SeasonBoardPage({ searchParams }: PageProps<"/season">) {
  const viewer = await requireStaff([...OFFICE_ROLES, "support"]);
  const office = hasAnyRole(viewer, OFFICE_ROLES);
  const admin = hasAnyRole(viewer, ADMIN_ROLES);
  const today = todayIn(viewer.timeZone);
  const sp = await searchParams;
  const season = isSeasonLabel(sp.season) ? sp.season : outreachSeason(today);
  const range = seasonRange(season);
  const supabase = await createClient();

  const [{ data: offers }, { data: holds }, { data: capacity }, { data: setting }, { data: minSetting }] = await Promise.all([
    supabase
      .from("season_offers")
      .select("id, org_id, stage, tier, priority_rank, priority_basis, offered_at, responded_at, organizations(name)")
      .eq("season", season)
      .order("priority_rank", { ascending: true, nullsFirst: false }),
    supabase
      .from("date_holds")
      .select("id, offer_id, job_id, status, expires_on, photo_days(date, stations)")
      .in("status", ["held", "confirmed"]),
    supabase
      .from("date_capacity")
      .select("date, stations_used, stations_held, jobs")
      .gte("date", range.start)
      .lte("date", range.end)
      .order("date"),
    supabase.from("settings").select("value").eq("key", "capacity.stations_per_date").maybeSingle(),
    supabase.from("settings").select("value").eq("key", "photo_day.min_players").maybeSingle(),
  ]);
  const minPlayers = typeof minSetting?.value === "number" ? minSetting.value : 50;

  const perDate = typeof setting?.value === "number" ? setting.value : 10;
  const holdByOffer = new Map((holds ?? []).filter((h) => h.offer_id).map((h) => [h.offer_id!, h]));
  const column = (stage: string) => (stage === "declined" || stage === "no_reply" ? "closed" : stage);
  const list = offers ?? [];

  return (
    <>
      <PageHeader eyebrow="Jobs · Season board" title={season}>
        <Link href={`/season?season=${encodeURIComponent(shiftSeason(season, -1))}`} className="text-sm text-muted hover:text-text">
          ← {shiftSeason(season, -1)}
        </Link>
        <Link href={`/season?season=${encodeURIComponent(shiftSeason(season, 1))}`} className="text-sm text-muted hover:text-text">
          {shiftSeason(season, 1)} →
        </Link>
      </PageHeader>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted">
          Returning leagues from {shiftSeason(season, -4)}, biggest first, so they get first pick of dates. The top
          share of the list holds a date for longer. Holds release on their own when they lapse.
        </p>
        {office && (
          <div className="flex flex-wrap items-start gap-3">
            {list.some((o) => o.stage === "not_offered") && (
              <DraftOffersButton season={season} label="Draft offers for everyone to offer" />
            )}
            <BuildBoardButton season={season} />
          </div>
        )}
      </div>

      <Card title={`Dates taken (${perDate} stations a date)`} className="mb-6">
        {capacity?.length ? (
          <ul className="flex flex-wrap gap-2">
            {capacity.map((d) => {
              const used = d.stations_used ?? 0;
              const full = used >= perDate;
              return (
                <li
                  key={d.date}
                  className={`rounded-lg border px-3 py-2 text-xs ${full ? "border-risk/60" : "border-line"}`}
                  title={`${d.jobs} job(s), ${d.stations_held ?? 0} stations on hold`}
                >
                  <p className="font-medium">{formatDate(d.date, { weekday: true })}</p>
                  <p className={full ? "text-risk" : "text-muted"}>
                    {used} of {perDate}
                    {d.stations_held ? ` (${d.stations_held} held)` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>No dates taken in {season} yet.</Empty>
        )}
      </Card>

      {list.length === 0 ? (
        <Empty>
          No leagues on the {season} board yet.{" "}
          {office ? "Add returning leagues to start it." : "The office starts the board."}
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          {COLUMNS.map((col) => {
            const items = list.filter((o) => column(o.stage) === col.key);
            return (
              <section key={col.key} className="min-w-0 space-y-3">
                <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted">
                  {col.title} <span className="text-text">{items.length}</span>
                </h2>
                {items.map((o) => {
                  const basis = (o.priority_basis ?? {}) as Basis;
                  const hold = holdByOffer.get(o.id);
                  const day = hold?.photo_days as { date: string; stations: number } | null | undefined;
                  const org = o.organizations as { name: string } | null;
                  const suggested = basis.last_date ? equivalentDate(basis.last_date) : range.start;
                  const daysLeft = hold ? Math.round((Date.parse(hold.expires_on) - Date.parse(today)) / 86_400_000) : null;
                  return (
                    <article key={o.id} className="rounded-xl border border-line bg-surface p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/leagues/${o.org_id}`} className="font-medium hover:text-accent">
                          {org?.name ?? "League"}
                        </Link>
                        {o.priority_rank && <span className="text-xs text-muted">#{o.priority_rank}</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {o.tier === "top" && <Pill tone="accent">Top tier</Pill>}
                        {basis.subjects ? <Pill>{basis.subjects} players</Pill> : null}
                        {basis.teams ? <Pill>{basis.teams} teams</Pill> : null}
                        {basis.subjects != null && basis.subjects < minPlayers && (
                          <Pill tone="warn">Under {minPlayers} players</Pill>
                        )}
                      </div>
                      {basis.last_date && (
                        <p className="mt-2 text-xs text-muted">Last time {formatDate(basis.last_date, { weekday: true })}</p>
                      )}

                      {hold && day && (
                        <p className="mt-2 text-xs">
                          <Link href={`/jobs/${hold.job_id}`} className="hover:text-accent">
                            {formatDate(day.date, { weekday: true })}, {day.stations} stations
                          </Link>
                          {hold.status === "held" && daysLeft !== null && (
                            <span className={daysLeft <= 5 ? " text-warn" : " text-muted"}>
                              {" "}
                              · releases {formatDate(hold.expires_on)}
                            </span>
                          )}
                        </p>
                      )}

                      {office && (o.stage === "not_offered" || o.stage === "offered" || o.stage === "no_reply" || o.stage === "declined") && (
                        <HoldForm
                          offerId={o.id}
                          suggestedDate={suggested >= range.start && suggested <= range.end ? suggested : range.start}
                          stations={2}
                          minDate={range.start}
                          maxDate={range.end}
                          canOverride={admin}
                        />
                      )}

                      {office && o.stage === "not_offered" && (
                        <DraftOffersButton season={season} offerId={o.id} label="Draft the offer email" />
                      )}
                      {office && (
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
                          {o.stage === "not_offered" && (
                            <form action={setOfferStage.bind(null, o.id, "offered")}>
                              <SubmitButton className="hover:text-text">Mark offered</SubmitButton>
                            </form>
                          )}
                          {(o.stage === "not_offered" || o.stage === "offered") && (
                            <form action={setOfferStage.bind(null, o.id, "declined")}>
                              <SubmitButton className="hover:text-text">Declined</SubmitButton>
                            </form>
                          )}
                          {(o.stage === "declined" || o.stage === "no_reply") && (
                            <form action={setOfferStage.bind(null, o.id, "offered")}>
                              <SubmitButton className="hover:text-text">Reopen</SubmitButton>
                            </form>
                          )}
                          {admin && hold?.status === "held" && (
                            <form action={extendHold.bind(null, hold.id)}>
                              <SubmitButton className="hover:text-text">Extend 7 days</SubmitButton>
                            </form>
                          )}
                        </div>
                      )}
                      {office && hold?.status === "held" && <ReleaseForm holdId={hold.id} />}
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
