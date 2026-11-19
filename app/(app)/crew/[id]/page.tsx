import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ADMIN_ROLES, OFFICE_ROLES, hasAnyRole, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import { formatDate, todayIn } from "@/lib/dates";
import { POSITION_LABEL } from "@/lib/staffing/plan";
import { removePayRate, saveHome } from "../actions";
import { PayForm } from "./pay-form";

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
    .select("id, full_name, email, phone, city, state, positions, level, active, notes, profile_id")
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();

  const [{ data: shifts }, { data: rates }, { data: home }] = await Promise.all([
    supabase
      .from("shifts")
      .select("id, position, station, photo_day_id, photo_days!inner(date), jobs(name)")
      .eq("crew_member_id", id)
      .eq("status", "filled")
      .limit(200),
    pay ? supabase.from("pay_rates").select("id, position, amount, unit").eq("crew_member_id", id).order("position") : Promise.resolve({ data: null }),
    pay ? supabase.from("crew_homes").select("address").eq("crew_member_id", id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const sorted = [...(shifts ?? [])].sort((a, b) => a.photo_days.date.localeCompare(b.photo_days.date));
  const coming = sorted.filter((s) => s.photo_days.date >= today);
  const past = sorted.filter((s) => s.photo_days.date < today);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/crew" className="text-muted hover:text-text">Crew</Link>
      </p>
      <PageHeader eyebrow={c.active ? "Crew" : "Crew, inactive"} title={c.full_name} />
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card title="Details">
          <div className="flex flex-wrap gap-1">
            {c.positions.map((p) => <Pill key={p}>{POSITION_LABEL[p] ?? p}</Pill>)}
            {c.level != null && <Pill tone="accent">Level {c.level}</Pill>}
          </div>
          <p className="mt-3 text-sm">{[c.email, c.phone].filter(Boolean).join(" · ") || "No contact details"}</p>
          <p className="text-sm text-muted">{[c.city, c.state].filter(Boolean).join(", ")}</p>
          <p className="mt-3 text-sm text-muted">
            {c.profile_id ? "Signed in to their shifts page." : "Has not signed in yet. They get the crew role from an invite with this email."}
          </p>
        </Card>
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
                      <button className="text-xs text-muted hover:text-risk">Remove</button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-sm text-muted">No pay rates yet. Only the owner and admins see this section.</p>
          )}
          <PayForm crewId={c.id} positions={c.positions} />
          <form action={saveHome.bind(null, c.id)} className="mt-6 border-t border-line pt-4">
            <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Home address, for mileage
              <input
                name="address"
                defaultValue={home?.address ?? ""}
                maxLength={300}
                placeholder="Street, town, state"
                className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm"
              />
            </label>
            <div className="mt-2 flex items-center gap-3">
              <button className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-accent">Save address</button>
              <span className="text-xs text-muted">Only the owner and admins see it. Clear the box to remove it.</span>
            </div>
          </form>
        </Card>
      )}
    </>
  );
}
