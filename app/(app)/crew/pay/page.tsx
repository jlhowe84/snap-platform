import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill, Table } from "@/components/ui";
import { formatDate, todayIn } from "@/lib/dates";
import { POSITION_LABEL } from "@/lib/staffing/plan";
import { defaultPeriod, payTotals } from "@/lib/staffing/pay";
import { removePayLine, savePayLine, setPayStatus } from "./actions";
import { AddPay } from "./add-pay";
import { loadPayLines } from "./load";

export const metadata: Metadata = { title: "Crew pay" };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const quiet = "rounded-lg border border-line px-2.5 py-1 text-sm hover:border-accent hover:text-accent";
const cell = "w-20 rounded-md border border-line bg-surface-2 px-2 py-1 text-sm";
const STATUS_TONE = { pending: "warn", approved: "info", paid: "ok" } as const;

export default async function CrewPayPage({ searchParams }: PageProps<"/crew/pay">) {
  const viewer = await requireStaff(ADMIN_ROLES);
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: periodSetting } = await supabase.from("settings").select("value").eq("key", "pay.period_days").maybeSingle();
  const { data: mileSetting } = await supabase.from("settings").select("value").eq("key", "pay.mileage_cents_per_mile").maybeSingle();
  const period = typeof periodSetting?.value === "number" ? periodSetting.value : 14;
  const mileCents = typeof mileSetting?.value === "number" ? mileSetting.value : 0;
  const fallback = defaultPeriod(todayIn(viewer.timeZone), period);
  const date = z.iso.date();
  const from = date.safeParse(sp.from).success ? String(sp.from) : fallback.from;
  const to = date.safeParse(sp.to).success && String(sp.to) >= from ? String(sp.to) : fallback.to;

  const { lines, error } = await loadPayLines(from, to);
  const totals = payTotals(lines);
  const grand = totals.reduce((s, t) => s + Math.round(t.total * 100), 0) / 100;
  const pending = lines.filter((l) => l.status === "pending").length;
  const approved = lines.filter((l) => l.status === "approved").length;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/crew" className="text-muted hover:text-text">Crew</Link>
      </p>
      <PageHeader eyebrow="People" title="Crew pay">
        <a href={`/crew/pay/export?from=${from}&to=${to}`} className={quiet}>Download CSV</a>
      </PageHeader>

      <Card className="mb-6">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            From
            <input type="date" name="from" defaultValue={from} className="mt-1 block rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            To
            <input type="date" name="to" defaultValue={to} className="mt-1 block rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm" />
          </label>
          <button className={quiet}>Show</button>
        </form>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <AddPay from={from} to={to} />
          {pending > 0 && (
            <form action={setPayStatus.bind(null, from, to, "approved")}>
              <button className={quiet}>Approve {pending} pending</button>
            </form>
          )}
          {approved > 0 && (
            <form action={setPayStatus.bind(null, from, to, "paid")}>
              <button className={quiet}>Mark {approved} approved as paid</button>
            </form>
          )}
        </div>
        <p className="mt-3 text-xs text-muted">
          Pay comes from each person&apos;s rate for the position they worked. Mileage is {mileCents ? `${mileCents} cents a mile` : "not paid yet (set the rate in Settings)"}.
          Payroll is still run where it is today; this report is what it runs from. A paid line cannot be changed.
        </p>
      </Card>

      {error ? (
        <Empty>Could not load pay: {error}</Empty>
      ) : !lines.length ? (
        <Empty>No pay in these dates yet. Add pay for the shifts worked, then check miles and adjustments.</Empty>
      ) : (
        <>
          <Card title={`By person · ${money.format(grand)}`} className="mb-6">
            <Table head={["Name", "Shifts", "Base", "Miles", "Mileage", "Adjustments", "Total"]}>
              {totals.map((t) => (
                <tr key={t.crew_member_id}>
                  <td className="px-3 py-2">
                    <Link href={`/crew/${t.crew_member_id}`} className="hover:text-accent">{t.full_name}</Link>
                    {t.unpriced > 0 && <> <Pill tone="warn">{t.unpriced} without a rate</Pill></>}
                  </td>
                  <td className="px-3 py-2">{t.lines}</td>
                  <td className="px-3 py-2">{money.format(t.base)}</td>
                  <td className="px-3 py-2">{t.miles}</td>
                  <td className="px-3 py-2">{money.format(t.mileage)}</td>
                  <td className="px-3 py-2">{money.format(t.adjustment)}</td>
                  <td className="px-3 py-2 font-semibold">{money.format(t.total)}</td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card title="Lines">
            <ul className="divide-y divide-line">
              {lines.map((l) => (
                <li key={l.id} className="grid gap-2 py-3 lg:grid-cols-[1.6fr_2.4fr_auto] lg:items-center">
                  <div>
                    <p className="font-medium">{l.full_name}</p>
                    <p className="text-sm text-muted">
                      {formatDate(l.work_date, { weekday: true })} · {l.description} · {POSITION_LABEL[l.position ?? ""] ?? l.position}
                    </p>
                    <p className="text-sm text-muted">
                      {l.rate == null ? "No rate" : `${money.format(l.rate)} per ${l.unit}${l.hours != null ? `, ${l.hours} h` : ""}`}
                      {l.note && ` · ${l.note}`}
                    </p>
                  </div>
                  {l.status === "paid" ? (
                    <p className="text-sm text-muted">
                      {l.miles} mi · adjustment {money.format(l.adjustment)}
                    </p>
                  ) : (
                    <form action={savePayLine.bind(null, l.id)} className="flex flex-wrap items-center gap-2 text-sm">
                      {l.unit === "hour" && (
                        <label className="text-muted">Hours <input name="hours" type="number" step="0.25" min={0} max={24} defaultValue={l.hours ?? ""} className={cell} /></label>
                      )}
                      <label className="text-muted" title="Round trip: home to the photo day and back">Miles, round trip <input name="miles" type="number" step="0.1" min={0} defaultValue={l.miles} className={cell} /></label>
                      {l.directions ? (
                        <a href={l.directions} target="_blank" rel="noreferrer" className="text-accent hover:underline">Route from home (one way, double it)</a>
                      ) : (
                        <span className="text-xs text-muted">No home address</span>
                      )}
                      <label className="text-muted">Adjust $ <input name="adjustment" type="number" step="0.01" defaultValue={l.adjustment} className={cell} /></label>
                      <input name="note" defaultValue={l.note ?? ""} placeholder="Note" maxLength={500} className="w-40 rounded-md border border-line bg-surface-2 px-2 py-1 text-sm" />
                      <button className={quiet}>Save</button>
                    </form>
                  )}
                  <div className="flex items-center gap-2 lg:justify-end">
                    <span className="font-semibold">{money.format(l.total)}</span>
                    <Pill tone={STATUS_TONE[l.status as keyof typeof STATUS_TONE] ?? "muted"}>{l.status}</Pill>
                    {l.status === "pending" && (
                      <form action={removePayLine.bind(null, l.id)}>
                        <button className="text-xs text-muted hover:text-risk">Remove</button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
