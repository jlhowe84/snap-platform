import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/dates";
import { POSITION_LABEL } from "@/lib/staffing/plan";
import { consentWording } from "@/lib/sms/crew";
import { formatUsMobile, toUsMobile } from "@/lib/sms/phone";
import { Answer } from "./answer";
import { TextsCard, type TextConsent } from "./texts";

export const metadata: Metadata = { title: "My shifts" };

type Row = {
  shift_id: string;
  kind: string;
  position: string;
  station: number | null;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
  photo_day_id: string;
  date: string;
  location_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  indoor: boolean | null;
  job_name: string;
};

function Shift({ s, children }: { s: Row; children?: React.ReactNode }) {
  const where = [s.location_name, s.address, s.city, s.state].filter(Boolean).join(", ");
  const map = s.address || s.location_name ? `https://maps.google.com/?q=${encodeURIComponent(where)}` : null;
  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{formatDate(s.date, { weekday: true })}</p>
      <p className="mt-1 text-lg font-semibold">{s.job_name}</p>
      <p className="text-sm">
        {POSITION_LABEL[s.position] ?? s.position}
        {s.station != null && ` · station ${s.station}`}
        {(s.start_time || s.end_time) && ` · ${[formatTime(s.start_time), formatTime(s.end_time)].filter(Boolean).join(" to ")}`}
      </p>
      {where && (
        <p className="mt-1 text-sm text-muted">
          {map ? <a href={map} className="underline-offset-2 hover:underline">{where}</a> : where}
          {s.indoor != null && ` · ${s.indoor ? "indoors" : "outdoors"}`}
        </p>
      )}
      {s.notes && <p className="mt-1 text-sm text-muted">{s.notes}</p>}
      {children}
    </li>
  );
}

// The crew phone page: offers open to me, then my coming shifts.
export default async function ShiftsPage() {
  const viewer = await requireStaff(["crew"]);
  const supabase = await createClient();
  const [{ data, error }, { data: consentData }, { data: details }] = await Promise.all([
    supabase.rpc("crew_shift_board"),
    supabase.rpc("my_text_consent"),
    supabase.rpc("my_crew_details"),
  ]);
  const rows = (data ?? []) as Row[];
  const consent = (consentData ?? null) as TextConsent;
  const phoneOnFile = (details as { phone?: string | null } | null)?.phone ?? "";
  const texts = (
    <TextsCard
      consent={consent}
      wording={consentWording(viewer.companyName)}
      phoneOnFile={consent?.phone ? formatUsMobile(consent.phone) : toUsMobile(phoneOnFile) ? formatUsMobile(toUsMobile(phoneOnFile)) : phoneOnFile}
      phoneShown={formatUsMobile(consent?.phone)}
    />
  );
  const offered = rows.filter((r) => r.kind === "offered");
  const mine = rows.filter((r) => r.kind === "mine");

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader eyebrow="Crew" title="My shifts">
        <Link href="/shifts/me" className="inline-flex min-h-12 items-center rounded-lg border border-line px-3 text-sm hover:bg-surface-2">
          My details
        </Link>
      </PageHeader>
      {error && <Empty>Could not load your shifts. Try again in a minute.</Empty>}
      {!consent && texts}
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold uppercase tracking-wider text-muted">
          Open shifts {offered.length > 0 && <Pill tone="accent">{offered.length}</Pill>}
        </h2>
        {offered.length ? (
          <ul className="space-y-3">
            {offered.map((s) => (
              <Shift key={s.shift_id} s={s}>
                <Answer shiftId={s.shift_id} />
              </Shift>
            ))}
          </ul>
        ) : (
          <Empty>Nothing open for you right now. New shifts show up here when they are published.</Empty>
        )}
      </section>
      <Card title="Your schedule">
        {mine.length ? (
          <ul className="space-y-3">
            {mine.map((s) => (
              <Shift key={s.shift_id} s={s}>
                <Link href={`/field/${s.photo_day_id}`} className="mt-3 inline-block rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-2">
                  Open the day: crew, kits, schedule and contact
                </Link>
              </Shift>
            ))}
          </ul>
        ) : (
          <Empty>No shifts booked yet.</Empty>
        )}
        <p className="mt-3 text-xs text-muted">Can&apos;t make a shift you took? Call or text the office so they can find someone.</p>
      </Card>
      {consent && <div className="mt-8">{texts}</div>}
    </div>
  );
}
