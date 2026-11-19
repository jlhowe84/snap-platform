import type { Metadata } from "next";
import Link from "next/link";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill, Table } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { searchTerm, usd } from "@/lib/lab/costs";
import { MatchJob } from "../forms";

export const metadata: Metadata = { title: "Lab invoices" };

const LIMIT = 100;

export default async function LabInvoicesPage({ searchParams }: PageProps<"/lab/invoices">) {
  await requireStaff(OFFICE_ROLES);
  const sp = await searchParams;
  const q = searchTerm(typeof sp.q === "string" ? sp.q : undefined);
  const ref = typeof sp.ref === "string" ? sp.ref.slice(0, 300) : "";
  const check = sp.check === "1";
  const supabase = await createClient();

  let query = supabase
    .from("lab_invoices")
    .select("id, lab, invoice_number, invoice_date, captura_order_number, reference, customer_name, total, needs_check, job_id", { count: "exact" })
    .order("invoice_date", { ascending: false })
    .order("invoice_number", { ascending: false })
    .limit(LIMIT);
  if (ref) query = ref === "(no job name)" ? query.is("reference", null) : query.eq("reference", ref);
  if (check) query = query.eq("needs_check", true);
  if (q) {
    const v = `"${q}"`;
    const like = `"%${q}%"`;
    query = query.or(
      [`invoice_number.eq.${v}`, `captura_order_number.eq.${v}`, `lab_order_number.eq.${v}`, `online_order_number.ilike.${v}`, `customer_name.ilike.${like}`, `reference.ilike.${like}`].join(","),
    );
  }
  const [{ data: rows, count }, { data: jobs }] = await Promise.all([
    query,
    ref && ref !== "(no job name)"
      ? supabase.from("job_overview").select("id, name, org_name, season, first_date").order("first_date", { ascending: false, nullsFirst: false }).limit(400)
      : Promise.resolve({ data: null }),
  ]);
  const matchedJob = ref ? (rows?.find((r) => r.job_id)?.job_id ?? null) : null;

  return (
    <>
      <PageHeader eyebrow="Lab" title={ref || "Lab invoices"}>
        <Link href="/lab" className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:border-accent hover:text-accent">
          Lab costs
        </Link>
      </PageHeader>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        {ref && <input type="hidden" name="ref" value={ref} />}
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">Search</span>
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Invoice number, order number, customer name or job name"
            className="w-full max-w-xl rounded-lg border border-line bg-surface px-3 py-2"
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="check" value="1" defaultChecked={check} />
          Only ones to check
        </label>
        <button className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:border-accent hover:text-accent">Search</button>
        {(q || check || ref) && (
          <Link href="/lab/invoices" className="pb-2 text-sm text-muted hover:text-accent">
            Clear
          </Link>
        )}
      </form>

      {ref && jobs && (
        <Card className="mb-4">
          <MatchJob
            reference={ref}
            jobId={matchedJob}
            jobs={jobs.filter((j) => j.id).map((j) => ({ id: j.id!, label: [j.org_name, j.name, j.season].filter(Boolean).join(" · ") }))}
          />
          <p className="mt-2 text-xs text-muted">Every invoice with this lab job name follows, including ones that arrive later.</p>
        </Card>
      )}

      <Card>
        {rows?.length ? (
          <>
            <Table head={["Invoice", "Date", "Customer", "Lab job name", "Order", "Total"]}>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2">
                    <Link href={`/lab/invoices/${r.id}`} className="font-medium hover:text-accent">
                      {r.invoice_number}
                    </Link>
                    {r.needs_check && (
                      <span className="ml-2">
                        <Pill tone="warn">Check</Pill>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{formatDate(r.invoice_date)}</td>
                  <td className="px-3 py-2">{r.customer_name ?? ""}</td>
                  <td className="px-3 py-2">{r.reference ?? ""}</td>
                  <td className="px-3 py-2">{r.captura_order_number ?? ""}</td>
                  <td className="px-3 py-2 font-semibold">{usd(r.total)}</td>
                </tr>
              ))}
            </Table>
            {(count ?? 0) > rows.length && (
              <p className="mt-3 text-xs text-muted">
                Showing the newest {rows.length} of {(count ?? 0).toLocaleString("en-US")}. Search to narrow it down.
              </p>
            )}
          </>
        ) : (
          <Empty>{q || check || ref ? "No invoices match." : "No invoices are stored yet."}</Empty>
        )}
      </Card>
    </>
  );
}
