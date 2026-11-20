import type { Metadata } from "next";
import Link from "next/link";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import { formatDate, todayIn } from "@/lib/dates";
import { KIT_STATUS_LABEL, bySection } from "@/lib/gear/field";
import { addChecklistItem, addKit, saveCameraBody, setChecklistItemActive, setKitStatus } from "./actions";

export const metadata: Metadata = { title: "Gear" };

const quiet = "rounded-lg border border-line px-2.5 py-1 text-sm hover:border-accent hover:text-accent";
const input = "rounded-md border border-line bg-surface-2 px-2 py-1 text-sm";
const KIT_TONE = { ready: "ok", needs_service: "risk", retired: "muted" } as const;

export default async function GearPage() {
  const viewer = await requireStaff(OFFICE_ROLES);
  const supabase = await createClient();
  // Kits out now, coming photo days, and the last month's returns.
  const since = new Date(Date.parse(`${todayIn(viewer.timeZone)}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: kits }, { data: bodies }, { data: items }, { data: checkouts }] = await Promise.all([
    supabase.from("kits").select("id, code, status, notes").order("code"),
    supabase.from("camera_bodies").select("id, serial, letter, model, kit_id, notes").order("letter", { nullsFirst: false }).order("serial"),
    supabase.from("kit_checklist_items").select("id, section, name, outdoor_only, active").order("position"),
    supabase
      .from("kit_checkouts")
      .select("id, kit_id, status, station, missing, issues, photo_day_id, photo_days!inner(date), jobs(name)")
      .gte("photo_days.date", since)
      .limit(500),
  ]);
  const byKit = new Map<string, NonNullable<typeof checkouts>>();
  for (const c of checkouts ?? []) byKit.set(c.kit_id, [...(byKit.get(c.kit_id) ?? []), c]);
  const kitCode = new Map((kits ?? []).map((k) => [k.id, k.code]));

  return (
    <>
      <PageHeader eyebrow="People" title="Gear" />

      <Card title="Kits" className="mb-6">
        {!kits?.length ? (
          <Empty>No kits yet.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {kits.map((k) => {
              const going = (byKit.get(k.id) ?? []).sort((a, b) => a.photo_days.date.localeCompare(b.photo_days.date));
              const out = going.find((c) => c.status === "out");
              return (
                <li key={k.id} className="grid gap-2 py-3 md:grid-cols-[6rem_1.4fr_2fr] md:items-center">
                  <p className="font-display text-xl font-semibold">Kit {k.code}</p>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Pill tone={KIT_TONE[k.status as keyof typeof KIT_TONE] ?? "muted"}>{KIT_STATUS_LABEL[k.status] ?? k.status}</Pill>
                    {out && <Pill tone="warn">Out: {out.jobs?.name}</Pill>}
                    {going
                      .filter((c) => c.status === "planned")
                      .slice(0, 2)
                      .map((c) => (
                        <Link key={c.id} href={`/staffing/${c.photo_day_id}`} className="text-muted hover:text-accent">
                          {formatDate(c.photo_days.date)}: {c.jobs?.name}
                        </Link>
                      ))}
                  </div>
                  <form action={setKitStatus.bind(null, k.id)} className="flex flex-wrap items-center gap-2 md:justify-end">
                    <select name="status" defaultValue={k.status} aria-label={`Kit ${k.code} status`} className={input}>
                      {Object.entries(KIT_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <input name="notes" defaultValue={k.notes ?? ""} placeholder="Notes" maxLength={1000} className={`${input} w-56`} />
                    <button className={quiet}>Save</button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
        <form action={addKit} className="mt-4 flex items-center gap-2">
          <input name="code" required maxLength={10} placeholder="New kit letter" className={`${input} w-36`} />
          <button className={quiet}>Add kit</button>
        </form>
      </Card>

      <Card title="Kits back with problems" className="mb-6">
        {(() => {
          const issues = (checkouts ?? []).filter((c) => c.status === "back" && (c.missing.length || c.issues));
          return issues.length ? (
            <ul className="space-y-2 text-sm">
              {issues.map((c) => (
                <li key={c.id}>
                  <span className="font-medium">Kit {kitCode.get(c.kit_id)}</span> from {c.jobs?.name}, {formatDate(c.photo_days.date)}:{" "}
                  {[c.missing.length ? `missing ${c.missing.join(", ")}` : null, c.issues].filter(Boolean).join("; ")}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nothing logged from recent photo days.</p>
          );
        })()}
      </Card>

      <Card title="Camera bodies" className="mb-6">
        <p className="mb-3 text-xs text-muted">
          Every frame carries its body&apos;s serial, so the pace numbers and card backups can be tied to a station. Put a body in a kit once it is
          confirmed; the letters may not match the kit letters.
        </p>
        <ul className="divide-y divide-line">
          {(bodies ?? []).map((b) => (
            <li key={b.id} className="py-2">
              <form action={saveCameraBody.bind(null, b.id)} className="flex flex-wrap items-center gap-2 text-sm">
                <input name="serial" defaultValue={b.serial} required maxLength={40} aria-label="Serial" className={`${input} w-28 font-mono`} />
                <input name="letter" defaultValue={b.letter ?? ""} maxLength={4} placeholder="Letter" aria-label="Letter" className={`${input} w-20`} />
                <input name="model" defaultValue={b.model ?? ""} maxLength={60} placeholder="Model" aria-label="Model" className={`${input} w-36`} />
                <select name="kit_id" defaultValue={b.kit_id ?? ""} aria-label="Kit" className={input}>
                  <option value="">No kit</option>
                  {(kits ?? []).map((k) => <option key={k.id} value={k.id}>Kit {k.code}</option>)}
                </select>
                <button className={quiet}>Save</button>
                {b.notes && <span className="text-xs text-muted">{b.notes}</span>}
              </form>
            </li>
          ))}
        </ul>
        <form action={saveCameraBody.bind(null, null)} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <input name="serial" required maxLength={40} placeholder="Serial" className={`${input} w-28 font-mono`} />
          <input name="letter" maxLength={4} placeholder="Letter" className={`${input} w-20`} />
          <input name="model" maxLength={60} placeholder="Model" className={`${input} w-36`} />
          <input type="hidden" name="kit_id" value="" />
          <button className={quiet}>Add body</button>
        </form>
      </Card>

      <Card title="Master checklist">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {bySection(items ?? []).map(([section, list]) => (
            <div key={section}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">{section}</p>
              <ul className="mt-1 space-y-1 text-sm">
                {list.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2">
                    <span className={i.active ? undefined : "text-muted line-through"}>
                      {i.name}
                      {i.outdoor_only && <span className="text-muted"> (outdoor)</span>}
                    </span>
                    <form action={setChecklistItemActive.bind(null, i.id, !i.active)}>
                      <button className="text-xs text-muted hover:text-accent">{i.active ? "Drop" : "Restore"}</button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <form action={addChecklistItem} className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <input name="section" required maxLength={100} placeholder="Section" list="gear-sections" className={`${input} w-40`} />
          <datalist id="gear-sections">
            {[...new Set((items ?? []).map((i) => i.section))].map((s) => <option key={s} value={s} />)}
          </datalist>
          <input name="name" required maxLength={200} placeholder="Item" className={`${input} w-56`} />
          <label className="flex items-center gap-1 text-muted"><input type="checkbox" name="outdoor_only" /> Outdoor only</label>
          <button className={quiet}>Add item</button>
        </form>
        <p className="mt-3 text-xs text-muted">Loaded from the gear files in SNAP OS (February 2026, not re-verified). Returning kits are checked against this list, and outdoor items show only for outdoor or unknown days.</p>
      </Card>
    </>
  );
}
