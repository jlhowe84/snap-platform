import type { Metadata } from "next";
import Link from "next/link";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill, Stat, Table, cx } from "@/components/ui";
import { costView, usd, type CostRow, type Sums } from "@/lib/lab/costs";
import { CheckInvoices } from "./forms";

export const metadata: Metadata = { title: "Lab costs" };

// Two sets of columns: what the lab charged for every order read, then the
// profit for only those orders Captura has answered for, so the two never mix.
const MONEY_HEAD = (first: string) => [first, "Orders", "Lab charged", "Found in Captura", "Net pay", "Lab on those", "Profit"];

const count = (n: number) => n.toLocaleString("en-US");
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "");

function MoneyCells({ s }: { s: Sums }) {
  return (
    <>
      <td className="px-3 py-2">{count(s.orders)}</td>
      <td className="px-3 py-2 font-semibold">{usd(s.total)}</td>
      <td className="px-3 py-2 text-muted">{s.priced === s.orders ? "All" : `${count(s.priced)} of ${count(s.orders)}`}</td>
      <td className="px-3 py-2">{s.priced ? usd(s.netPay) : <span className="text-muted">Not yet</span>}</td>
      <td className="px-3 py-2">{s.priced ? usd(s.pricedLab) : ""}</td>
      <td className={s.profit < 0 ? "px-3 py-2 font-semibold text-risk" : "px-3 py-2 font-semibold"}>{s.priced ? usd(s.profit) : ""}</td>
    </>
  );
}
// Checking for invoices reads mail and files PDFs.
export const maxDuration = 60;

export default async function LabCostsPage({ searchParams }: PageProps<"/lab">) {
  const viewer = await requireStaff(OFFICE_ROLES);
  const sp = await searchParams;
  const supabase = await createClient();
  const picked = typeof sp.year === "string" && /^\d{4}$/.test(sp.year) ? Number(sp.year) : null;
  let invoiceCount = supabase.from("lab_invoices").select("id", { count: "exact", head: true });
  if (picked) invoiceCount = invoiceCount.gte("invoice_date", `${picked}-01-01`).lte("invoice_date", `${picked}-12-31`);
  const [{ data: rows }, { data: state }, { count: unread }, { count: invoices }] = await Promise.all([
    supabase.rpc("lab_cost_summary"),
    supabase.from("lab_invoice_sync_state").select("last_run_at, last_error").order("last_run_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("lab_invoice_skips").select("gmail_message_id", { count: "exact", head: true }).neq("reason", "These invoices were already stored from another email."),
    invoiceCount,
  ]);
  const all = (rows ?? []) as CostRow[];
  const view = costView(all, picked);
  const when = new Intl.DateTimeFormat("en-US", { timeZone: viewer.timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const unmatched = view.jobs.filter((j) => !j.jobId).length;

  return (
    <>
      <PageHeader eyebrow="Money" title="Lab costs">
        <Link href="/lab/invoices" className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:border-accent hover:text-accent">
          Find an invoice
        </Link>
        <CheckInvoices />
      </PageHeader>

      <p className="mb-4 text-sm text-muted">
        {state?.last_run_at ? `Last checked ${when.format(new Date(state.last_run_at))}.` : "Invoices have not been checked yet."}
        {state?.last_error ? <span className="text-risk"> {state.last_error}</span> : null}
        {unread ? ` ${unread} invoice ${unread === 1 ? "email" : "emails"} could not be read.` : ""}
      </p>

      {all.length === 0 ? (
        <Empty>No invoices are stored yet. Once the Drive folder is shared (Settings), use Check for new invoices.</Empty>
      ) : (
        <div className="space-y-6">
          <nav className="flex flex-wrap gap-2" aria-label="Year">
            {[{ label: "All years", year: null as number | null }, ...view.years.map((y) => ({ label: String(y.year), year: y.year as number | null }))].map((y) => (
              <Link
                key={y.label}
                href={y.year ? `/lab?year=${y.year}` : "/lab"}
                aria-current={y.year === picked ? "page" : undefined}
                className={cx(
                  "rounded-lg border px-3 py-1.5 text-sm font-medium",
                  y.year === picked ? "border-accent bg-accent text-accent-ink" : "border-line text-muted hover:border-accent hover:text-accent",
                )}
              >
                {y.label}
              </Link>
            ))}
          </nav>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">What the lab charged</h2>
            <p className="mb-3 text-sm text-muted">Every order on every invoice read so far.</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Lab charged" value={usd(view.all.total)} hint={`${count(view.all.orders)} orders on ${count(invoices ?? 0)} invoices`} />
              <Stat label="Prints and products" value={usd(view.all.products)} hint={`${pct(view.all.products, view.all.total)} of the lab's charge`} />
              <Stat label="Shipping to families" value={usd(view.all.shipping)} hint={`${pct(view.all.shipping, view.all.total)} of the lab's charge`} />
              <Stat label="Sales tax" value={usd(view.all.tax)} hint="Charged by the lab" />
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Profit on orders found in Captura</h2>
            <p className="mb-3 text-sm text-muted">
              {view.all.priced === view.all.orders
                ? "Every order has been found in Captura."
                : `Only the ${count(view.all.priced)} of ${count(view.all.orders)} orders looked up in Captura so far. Each check looks up more, so these numbers grow until every order is in.`}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Customers paid" value={usd(view.all.orderTotal)} hint={`${count(view.all.priced)} orders, including their tax and shipping`} />
              <Stat label="Net pay from Captura" value={usd(view.all.netPay)} hint="What Captura pays SNAP after its fees" />
              <Stat label="Lab charged for these" value={usd(view.all.pricedLab)} hint={`${usd(view.all.priced ? view.all.pricedLab / view.all.priced : 0)} an order`} />
              <Stat label="Profit after lab" value={usd(view.all.profit)} hint={`${pct(view.all.profit, view.all.netPay)} of net pay kept`} />
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card title="By year">
              <Table head={MONEY_HEAD("Year")}>
                {view.years.map((y) => (
                  <tr key={y.year} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">{y.year}</td>
                    <MoneyCells s={y} />
                  </tr>
                ))}
              </Table>
            </Card>
            <Card title={picked ? `By season, invoices dated ${picked}` : "By season"}>
              <Table head={MONEY_HEAD("Season")}>
                {view.seasons.map((s) => (
                  <tr key={s.season} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">{s.season}</td>
                    <MoneyCells s={s} />
                  </tr>
                ))}
              </Table>
              <p className="mt-3 text-xs text-muted">A matched job counts in its own season. An unmatched one counts in the season of its first invoice.</p>
            </Card>
          </div>
          <p className="text-xs text-muted">
            In the tables, Lab charged covers every order. Net pay, Lab on those and Profit cover only the orders found in Captura, so Profit is Net pay less
            Lab on those. Orders with nothing printed (digital downloads) never reach the lab, so they are not here.
          </p>

          <Card title={picked ? `By job, invoices dated ${picked}` : "By job"}>
            {unmatched > 0 && (
              <p className="mb-3 text-sm text-muted">
                {unmatched} lab job {unmatched === 1 ? "name is" : "names are"} not matched to a job yet. Open one to match it.
              </p>
            )}
            <Table head={["Lab job name", "Job", "Season", ...MONEY_HEAD("").slice(1)]}>
              {view.jobs.map((j) => (
                <tr key={`${j.reference}:${j.jobId ?? ""}`} className="border-b border-line last:border-0">
                  <td className="px-3 py-2">
                    <Link href={`/lab/invoices?ref=${encodeURIComponent(j.reference)}`} className="font-medium hover:text-accent">
                      {j.reference}
                    </Link>
                    {j.needsCheck > 0 && (
                      <span className="ml-2">
                        <Pill tone="warn">{j.needsCheck} to check</Pill>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {j.jobId ? (
                      <Link href={`/jobs/${j.jobId}`} className="hover:text-accent">
                        {j.jobName ?? "Job"}
                      </Link>
                    ) : (
                      <span className="text-muted">Not matched</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{j.season ?? ""}</td>
                  <MoneyCells s={j} />
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}
    </>
  );
}
