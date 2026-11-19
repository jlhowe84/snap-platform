import type { Metadata } from "next";
import Link from "next/link";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill, Stat, Table, cx } from "@/components/ui";
import { costView, usd, type CostRow } from "@/lib/lab/costs";
import { CheckInvoices } from "./forms";

export const metadata: Metadata = { title: "Lab costs" };
// Checking for invoices reads mail and files PDFs.
export const maxDuration = 60;

export default async function LabCostsPage({ searchParams }: PageProps<"/lab">) {
  const viewer = await requireStaff(OFFICE_ROLES);
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: rows }, { data: state }, { count: unread }] = await Promise.all([
    supabase.rpc("lab_cost_summary"),
    supabase.from("lab_invoice_sync_state").select("last_run_at, last_error").order("last_run_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("lab_invoice_skips").select("gmail_message_id", { count: "exact", head: true }).neq("reason", "These invoices were already stored from another email."),
  ]);
  const all = (rows ?? []) as CostRow[];
  const picked = typeof sp.year === "string" && /^\d{4}$/.test(sp.year) ? Number(sp.year) : null;
  const view = costView(all, picked);
  const when = new Intl.DateTimeFormat("en-US", { timeZone: viewer.timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const unmatched = view.jobs.filter((j) => !j.jobId).length;

  return (
    <>
      <PageHeader eyebrow="Lab" title="Lab costs">
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

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Lab total" value={usd(view.all.total)} hint={`${view.all.invoices.toLocaleString("en-US")} invoices, by invoice date`} />
            <Stat label="Products" value={usd(view.all.products)} />
            <Stat label="Shipping" value={usd(view.all.shipping)} />
            <Stat label="Tax" value={usd(view.all.tax)} />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card title="By year">
              <Table head={["Year", "Invoices", "Products", "Shipping", "Tax", "Total"]}>
                {view.years.map((y) => (
                  <tr key={y.year} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">{y.year}</td>
                    <td className="px-3 py-2">{y.invoices.toLocaleString("en-US")}</td>
                    <td className="px-3 py-2">{usd(y.products)}</td>
                    <td className="px-3 py-2">{usd(y.shipping)}</td>
                    <td className="px-3 py-2">{usd(y.tax)}</td>
                    <td className="px-3 py-2 font-semibold">{usd(y.total)}</td>
                  </tr>
                ))}
              </Table>
            </Card>
            <Card title={picked ? `By season, invoices dated ${picked}` : "By season"}>
              <Table head={["Season", "Invoices", "Products", "Shipping", "Tax", "Total"]}>
                {view.seasons.map((s) => (
                  <tr key={s.season} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">{s.season}</td>
                    <td className="px-3 py-2">{s.invoices.toLocaleString("en-US")}</td>
                    <td className="px-3 py-2">{usd(s.products)}</td>
                    <td className="px-3 py-2">{usd(s.shipping)}</td>
                    <td className="px-3 py-2">{usd(s.tax)}</td>
                    <td className="px-3 py-2 font-semibold">{usd(s.total)}</td>
                  </tr>
                ))}
              </Table>
              <p className="mt-3 text-xs text-muted">A matched job counts in its own season. An unmatched one counts in the season of its first invoice.</p>
            </Card>
          </div>

          <Card title={picked ? `By job, invoices dated ${picked}` : "By job"}>
            {unmatched > 0 && (
              <p className="mb-3 text-sm text-muted">
                {unmatched} lab job {unmatched === 1 ? "name is" : "names are"} not matched to a job yet. Open one to match it.
              </p>
            )}
            <Table head={["Lab job name", "Job", "Season", "Invoices", "Products", "Shipping", "Tax", "Total"]}>
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
                  <td className="px-3 py-2">{j.invoices.toLocaleString("en-US")}</td>
                  <td className="px-3 py-2">{usd(j.products)}</td>
                  <td className="px-3 py-2">{usd(j.shipping)}</td>
                  <td className="px-3 py-2">{usd(j.tax)}</td>
                  <td className="px-3 py-2 font-semibold">{usd(j.total)}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}
    </>
  );
}
