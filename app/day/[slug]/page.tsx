import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatTime } from "@/lib/dates";
import { PublicShell } from "@/components/public-shell";
import { DAY_STATUS_NOTE, mapsHref, placeLine, safeShopUrl, teamTimes, type PublicDayPage } from "@/lib/public/day-page";

const load = cache(async (slug: string): Promise<PublicDayPage | null> => {
  if (!/^[a-z0-9-]{6,80}$/.test(slug)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_day_page", { p_slug: slug });
  return (data as PublicDayPage | null) ?? null;
});

export async function generateMetadata({ params }: PageProps<"/day/[slug]">): Promise<Metadata> {
  const page = await load((await params).slug);
  return { title: page ? `${page.league ?? page.job} photo day` : "Photo day" };
}

export default async function PublicDayPageView({ params, searchParams }: PageProps<"/day/[slug]">) {
  const { slug } = await params;
  const page = await load(slug);
  if (!page) notFound();
  const sp = await searchParams;
  const team = typeof sp.team === "string" ? sp.team.slice(0, 60) : "";
  const shop = safeShopUrl(page.shop_url);
  const anyTimes = page.days.some((d) => d.teams?.length);

  return (
    <PublicShell companyName={page.company?.name ?? null} companySlug={page.company?.slug ?? null} kicker="Photo day">
      <h1 className="font-display text-4xl font-semibold uppercase tracking-wide">{page.league ?? page.job}</h1>
      {page.sports.length > 0 && <p className="mt-1 text-muted">{page.sports.join(", ")}</p>}

      {shop && (
        <section className="mt-6 rounded-xl border border-accent/40 bg-surface p-5">
          <h2 className="font-semibold">Order before photo day</h2>
          {page.coupon && (
            <p className="mt-1 text-sm">
              Use code <span className="rounded bg-surface-2 px-2 py-0.5 font-mono font-semibold">{page.coupon}</span> at checkout.
            </p>
          )}
          <a href={shop} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110">
            Go to the order page
          </a>
        </section>
      )}

      <section className="mt-8 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">When and where</h2>
        {page.days.length === 0 && <p className="text-sm text-muted">The date will be posted here soon.</p>}
        {page.days.map((d) => {
          const place = placeLine(d);
          const map = mapsHref(d);
          const note = DAY_STATUS_NOTE[d.status];
          return (
            <article key={d.id} className="rounded-xl border border-line bg-surface p-5">
              <p className={`font-semibold ${d.status === "scheduled" ? "" : "line-through decoration-risk/60"}`}>
                {formatDate(d.date, { weekday: true })}
                {d.label ? ` · ${d.label}` : ""}
              </p>
              {note && <p className="mt-1 text-sm font-semibold text-risk">{note}</p>}
              {d.status === "scheduled" && (
                <>
                  {d.start_time && (
                    <p className="text-sm text-muted">
                      {formatTime(d.start_time)}
                      {d.end_time ? ` to ${formatTime(d.end_time)}` : ""}
                    </p>
                  )}
                  {(d.location_name || place) && (
                    <p className="mt-2 text-sm">
                      {d.location_name && <span className="block font-medium">{d.location_name}</span>}
                      {place && <span className="block text-muted">{place}</span>}
                      {map && (
                        <a href={map} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
                          Map
                        </a>
                      )}
                    </p>
                  )}
                  {d.location_details && <p className="mt-2 text-sm text-muted">{d.location_details}</p>}
                  {d.indoor === false && d.alt_indoor_location && (
                    <p className="mt-2 text-sm text-muted">If the weather turns: {d.alt_indoor_location}</p>
                  )}
                </>
              )}
            </article>
          );
        })}
      </section>

      {(page.what_to_wear || page.what_to_bring || page.note) && (
        <section className="mt-8 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Before you come</h2>
          {page.what_to_wear && <Info title="What to wear" body={page.what_to_wear} />}
          {page.what_to_bring && <Info title="What to bring" body={page.what_to_bring} />}
          {page.note && <Info title="Good to know" body={page.note} />}
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Your team&apos;s time</h2>
        {!anyTimes ? (
          <p className="mt-2 text-sm text-muted">Team times appear here once the league sends in the schedule.</p>
        ) : (
          <>
            <form className="mt-3 flex gap-2" role="search">
              <input
                name="team"
                defaultValue={team}
                placeholder="Team name"
                aria-label="Team name"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              />
              <button className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold hover:border-accent">Find</button>
            </form>
            {page.days
              .filter((d) => d.status === "scheduled" && d.teams?.length)
              .map((d) => {
                const rows = teamTimes(d.teams!, team);
                return (
                  <div key={d.id} className="mt-4 rounded-xl border border-line bg-surface p-5">
                    <p className="font-semibold">{formatDate(d.date, { weekday: true })}</p>
                    {rows.length === 0 ? (
                      <p className="mt-2 text-sm text-muted">No team by that name on this day.</p>
                    ) : (
                      <ul className="mt-2 divide-y divide-line text-sm">
                        {rows.map((r) => (
                          <li key={r.time} className="flex gap-4 py-2">
                            <span className="w-20 shrink-0 font-mono">{formatTime(r.time)}</span>
                            <span>{r.teams.join(", ")}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
          </>
        )}
      </section>
    </PublicShell>
  );
}

function Info({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 whitespace-pre-line text-sm text-muted">{body}</p>
    </div>
  );
}
