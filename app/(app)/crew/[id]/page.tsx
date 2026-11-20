import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ADMIN_ROLES, OFFICE_ROLES, hasAnyRole, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import { formatDate, todayIn } from "@/lib/dates";
import { POSITION_LABEL } from "@/lib/staffing/plan";
import { crewPhotoUrls } from "@/lib/staffing/photos";
import { removeCrewPhoto, removePayRate } from "../actions";
import { PayForm } from "./pay-form";
import { DetailsForm, PhotoUpload, PrivateForm } from "./profile-forms";
import { SubmitButton } from "@/components/submit-button";

export const metadata: Metadata = { title: "Crew" };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default async function CrewMemberPage({ params }: PageProps<"/crew/[id]">) {
  const viewer = await requireStaff(OFFICE_ROLES);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const pay = hasAnyRole(viewer, ADMIN_ROLES);
  const supabase = await createClient();
  const today = todayIn(viewer.timeZone);

  const { data: c } = await supabase
    .from("crew_members")
    .select("id, full_name, email, phone, city, state, positions, level, active, notes, profile_id, photo_path")
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();

  const [{ data: shifts }, { data: rates }, { data: priv }, photos] = await Promise.all([
    supabase
      .from("shifts")
      .select("id, position, station, photo_day_id, photo_days!inner(date), jobs(name)")
      .eq("crew_member_id", id)
      .eq("status", "filled")
      .limit(200),
    pay ? supabase.from("pay_rates").select("id, position, amount, unit").eq("crew_member_id", id).order("position") : Promise.resolve({ data: null }),
    pay
      ? supabase.from("crew_private").select("address, emergency_name, emergency_phone").eq("crew_member_id", id).maybeSingle()
      : Promise.resolve({ data: null }),
    crewPhotoUrls([c.photo_path]),
  ]);
  const photo = c.photo_path ? photos.get(c.photo_path) : undefined;
  const sorted = [...(shifts ?? [])].sort((a, b) => a.photo_days.date.localeCompare(b.photo_days.date));
  const coming = sorted.filter((s) => s.photo_days.date >= today);
  const past = sorted.filter((s) => s.photo_days.date < today);
  const initials = c.full_name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/crew" className="text-muted hover:text-text">Crew</Link>
      </p>
      <div className="mb-6 flex flex-wrap items-center gap-5">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-24 w-24 rounded-full border border-line object-cover" />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-full border border-line bg-surface-2 font-display text-3xl font-semibold text-muted">
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <PageHeader eyebrow={c.active ? "Crew" : "Crew, inactive"} title={c.full_name} />
          <div className="-mt-3 flex flex-wrap items-center gap-2">
            {c.positions.map((p) => <Pill key={p}>{POSITION_LABEL[p] ?? p}</Pill>)}
            {c.level != null && <Pill tone="accent">Level {c.level}</Pill>}
            <span className="text-sm text-muted">{[c.phone, c.email].filter(Boolean).join(" · ")}</span>
          </div>
        </div>
        <div className="flex flex-col items-start gap-2">
          <PhotoUpload crewId={c.id} hasPhoto={!!c.photo_path} />
          {c.photo_path && (
            <form action={removeCrewPhoto.bind(null, c.id)}>
              <SubmitButton className="text-xs text-muted hover:text-risk">Remove photo</SubmitButton>
            </form>
          )}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Details">
          <DetailsForm
            crew={{
              id: c.id,
              full_name: c.full_name,
              email: c.email,
              phone: c.phone,
              city: c.city,
              state: c.state,
              positions: c.positions,
              level: c.level,
              active: c.active,
              notes: c.notes,
            }}
          />
          <p className="mt-4 text-sm text-muted">
            {c.profile_id ? "Signed in to their shifts page." : "Has not signed in yet. They get the crew role from an invite with this email."}
          </p>
        </Card>
        <div className="space-y-4">
          <Card title={`Coming shifts (${coming.length})`}>
            {coming.length ? (
              <ul className="space-y-1 text-sm">
                {coming.map((s) => (
                  <li key={s.id}>
                    <Link href={`/staffing/${s.photo_day_id}`} className="hover:text-accent">
                      {formatDate(s.photo_days.date, { weekday: true })}: {s.jobs?.name}, {POSITION_LABEL[s.position] ?? s.position}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No coming shifts.</Empty>
            )}
            {past.length > 0 && <p className="mt-3 text-xs text-muted">{past.length} past shift{past.length === 1 ? "" : "s"} on record.</p>}
          </Card>
          {pay && (
            <Card title="Home and emergency contact">
              <PrivateForm crewId={c.id} current={priv ?? null} />
              <p className="mt-3 text-xs text-muted">Only the owner and admins see this.</p>
            </Card>
          )}
        </div>
      </div>

      {pay && (
        <Card title="Pay rates">
          {rates?.length ? (
            <ul className="mb-4 divide-y divide-line">
              {rates.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>{POSITION_LABEL[r.position] ?? r.position}</span>
                  <span className="flex items-center gap-3">
                    {money.format(Number(r.amount))} per {r.unit}
                    <form action={removePayRate.bind(null, c.id, r.id)}>
                      <SubmitButton className="text-xs text-muted hover:text-risk">Remove</SubmitButton>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-sm text-muted">No pay rates yet. Only the owner and admins see this section.</p>
          )}
          <PayForm crewId={c.id} positions={c.positions} />
        </Card>
      )}
    </>
  );
}
