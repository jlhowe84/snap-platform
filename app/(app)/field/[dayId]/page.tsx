import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Pill } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/dates";
import { POSITION_LABEL } from "@/lib/staffing/plan";
import { bySection, placeOf, telHref, type FieldView } from "@/lib/gear/field";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Field view" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4 print:break-inside-avoid print:rounded-none print:border-0 print:border-t print:p-2">
      <h2 className="mb-2 font-display text-base font-semibold uppercase tracking-wider text-muted">{title}</h2>
      {children}
    </section>
  );
}

const times = (a: string | null, b: string | null) => [formatTime(a), formatTime(b)].filter(Boolean).join(" to ");

// Everything the crew on a photo day needs, on a phone, and printable as the
// day sheet for venues with no signal. The database decides who may see it.
export default async function FieldViewPage({ params }: PageProps<"/field/[dayId]">) {
  await requireStaff();
  const { dayId } = await params;
  if (!z.uuid().safeParse(dayId).success) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("field_view", { p_photo_day: dayId });
  if (!data) notFound();
  const v = data as unknown as FieldView;
  const place = placeOf(v.day);
  const stations = [...new Set(v.schedule.map((s) => s.station))].sort((a, b) => a - b);

  return (
    <div className="mx-auto max-w-2xl space-y-4 print:max-w-none print:space-y-2">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href={v.staff ? `/staffing/${v.day.id}` : "/shifts"} className="text-sm text-muted hover:text-text">
          {v.staff ? "Staffing" : "My shifts"}
        </Link>
        <PrintButton />
      </div>

      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{formatDate(v.day.date, { weekday: true })}</p>
        <h1 className="font-display text-3xl font-semibold uppercase tracking-wide">{v.job.name}</h1>
        <p className="mt-1 text-lg">{times(v.day.start_time, v.day.end_time) || "Times to confirm"}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {v.day.status !== "scheduled" && <Pill tone="risk">{v.day.status === "postponed" ? "Postponed" : "Cancelled"}</Pill>}
          {v.day.indoor === true && <Pill tone="info">Indoors</Pill>}
          {v.day.indoor === false && <Pill tone="warn">Outdoors</Pill>}
          <Pill>{v.day.stations} station{v.day.stations === 1 ? "" : "s"}</Pill>
          {v.job.expected_subjects != null && <Pill>About {v.job.expected_subjects} players</Pill>}
          {v.job.team_photo_type && <Pill>{v.job.team_photo_type === "composite" ? "Composite team photos" : "Traditional team photos"}</Pill>}
        </div>
      </header>

      <Section title="Where">
        {place.line ? (
          place.mapUrl ? (
            <a href={place.mapUrl} className="text-accent underline-offset-2 hover:underline">{place.line}</a>
          ) : (
            <p>{place.line}</p>
          )
        ) : (
          <p className="text-muted">Location to confirm.</p>
        )}
        {v.day.location_details && <p className="mt-2 whitespace-pre-line text-sm">{v.day.location_details}</p>}
        {v.day.alt_indoor_location && <p className="mt-2 text-sm"><span className="text-muted">Rain plan:</span> {v.day.alt_indoor_location}</p>}
      </Section>

      {(v.day.notes || v.job.notes) && (
        <Section title="What's different today">
          {v.day.notes && <p className="whitespace-pre-line text-sm">{v.day.notes}</p>}
          {v.job.notes && <p className="mt-2 whitespace-pre-line text-sm text-muted">{v.job.notes}</p>}
        </Section>
      )}

      <Section title="League contact">
        {v.contacts.length ? (
          <ul className="space-y-1 text-sm">
            {v.contacts.map((c, i) => {
              const tel = telHref(c.phone);
              return (
                <li key={i}>
                  <span className="font-medium">{c.name}</span>
                  {tel && <> · <a href={tel} className="text-accent">{c.phone}</a></>}
                  {c.email && <span className="text-muted"> · {c.email}</span>}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">No contact on the job yet. Call the office.</p>
        )}
      </Section>

      <Section title="Crew">
        {v.crew.length ? (
          <ul className="space-y-1 text-sm">
            {v.crew.map((c, i) => {
              const tel = telHref(c.phone);
              return (
                <li key={i} className={c.me ? "font-semibold" : undefined}>
                  {c.name}
                  {c.me && " (you)"} · {POSITION_LABEL[c.position] ?? c.position}
                  {c.station != null && `, station ${c.station}`}
                  {times(c.start_time, c.end_time) && <span className="text-muted"> · {times(c.start_time, c.end_time)}</span>}
                  {tel && <> · <a href={tel} className="text-accent">{c.phone}</a></>}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nobody booked yet.</p>
        )}
      </Section>

      <Section title="Kits">
        {v.kits.length ? (
          <ul className="space-y-1 text-sm">
            {v.kits.map((k) => (
              <li key={k.code}>
                <span className="font-medium">Kit {k.code}</span>
                {k.station != null && `, station ${k.station}`}
                {k.cameras.length > 0 && <span className="text-muted"> · camera {k.cameras.join(", ")}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No kits assigned yet.</p>
        )}
      </Section>

      {v.schedule.length > 0 && (
        <Section title="Schedule">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-muted">
                  <th className="py-1 pr-3 font-semibold">Time</th>
                  {stations.map((s) => <th key={s} className="py-1 pr-3 font-semibold">Station {s}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[...new Set(v.schedule.map((s) => s.starts_at))].map((t) => (
                  <tr key={t}>
                    <td className="py-1 pr-3 whitespace-nowrap">{formatTime(t)}</td>
                    {stations.map((st) => {
                      const slot = v.schedule.find((s) => s.starts_at === t && s.station === st);
                      return (
                        <td key={st} className="py-1 pr-3">
                          {slot ? (slot.kind === "break" ? <span className="text-muted">Break</span> : <>{slot.label}{slot.players != null && <span className="text-muted"> ({slot.players})</span>}</>) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {v.checklist.length > 0 && (
        <Section title="Kit checklist">
          <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-3">
            {bySection(v.checklist).map(([section, items]) => (
              <div key={section}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">{section}</p>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {items.map((i) => (
                    <li key={i.name} className="flex gap-2">
                      <span aria-hidden className="mt-1 inline-block h-3 w-3 shrink-0 rounded-sm border border-line" />
                      {i.name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
