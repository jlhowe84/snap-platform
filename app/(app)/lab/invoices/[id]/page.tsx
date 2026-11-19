import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Pill, Table } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { usd } from "@/lib/lab/costs";

export const metadata: Metadata = { title: "Lab invoice" };

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function LabInvoicePage({ params }: PageProps<"/lab/invoices/[id]">) {
  await requireStaff(OFFICE_ROLES);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: invoice }, { data: orders }, { data: items }] = await Promise.all([
    supabase.from("lab_invoices").select("*").eq("id", id).maybeSingle(),
    supabase.from("lab_invoice_orders").select("*, jobs(id, name)").eq("invoice_id", id).order("position"),
    supabase.from("lab_invoice_items").select("order_id, position, description, org_qty, each_qty, unit_price, extended").eq("invoice_id", id).order("position"),
  ]);
  if (!invoice) notFound();

  return (
    <>
      <PageHeader eyebrow={`Lab invoice · ${formatDate(invoice.invoice_date)}`} title={invoice.invoice_number}>
        {invoice.drive_file_id && (
          <a
            href={`https://drive.google.com/file/d/${encodeURIComponent(invoice.drive_file_id)}/view`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:border-accent hover:text-accent"
          >
            Open the PDF in Drive
          </a>
        )}
        <Link href="/lab/invoices" className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:border-accent hover:text-accent">
          All invoices
        </Link>
      </PageHeader>

      {invoice.needs_check && (
        <p className="mb-4 rounded-lg border border-warn/40 p-3 text-sm">
          <Pill tone="warn">Check</Pill> <span className="ml-2">{invoice.check_note ?? "This invoice did not read cleanly. Compare it with the PDF."}</span>
        </p>
      )}

      <p className="mb-6 text-sm text-muted">
        {invoice.lab} invoice for {(orders ?? []).length} {(orders ?? []).length === 1 ? "order" : "orders"}: subtotal {usd(invoice.subtotal)}, tax {usd(invoice.tax)},
        total <span className="font-semibold text-text">{usd(invoice.total)}</span>
        {invoice.balance !== null ? `, balance ${usd(invoice.balance)}` : ""}.
        {invoice.drive_folder ? ` Filed in the ${invoice.drive_folder} folder as ${invoice.file_name}.` : ""}
      </p>

      <div className="space-y-6">
        {(orders ?? []).map((o) => {
          const job = o.jobs as { id: string; name: string } | null;
          const lines = (items ?? []).filter((i) => i.order_id === o.id);
          const net = n(o.order_net_pay);
          const lab = Number(o.total);
          const labFees = n(o.order_lab_fees);
          return (
            <Card key={o.id} title={`Order ${o.captura_order_number ?? o.lab_order_number ?? o.position}`}>
              <div className="grid gap-6 xl:grid-cols-2">
                <div className="space-y-4">
                  <Facts
                    rows={[
                      ["Customer", o.customer_name ?? <span className="text-muted">Not on the invoice</span>],
                      ["Captura order (the lab's PO No)", o.captura_order_number ?? ""],
                      ["Lab order number", o.lab_order_number ?? ""],
                      ["Received by the lab", formatDate(o.received_date)],
                      [
                        "Lab job name",
                        o.reference ? (
                          <Link href={`/lab/invoices?ref=${encodeURIComponent(o.reference)}`} className="hover:text-accent">
                            {o.reference}
                          </Link>
                        ) : (
                          ""
                        ),
                      ],
                      [
                        "Job",
                        job ? (
                          <Link href={`/jobs/${job.id}`} className="hover:text-accent">
                            {job.name}
                          </Link>
                        ) : (
                          <span className="text-muted">Not matched</span>
                        ),
                      ],
                    ]}
                  />
                  <Table head={["Item", "Qty", "Each", "Price", "Amount"]}>
                    {lines.map((i) => (
                      <tr key={i.position} className="border-b border-line last:border-0">
                        <td className="px-3 py-2">{i.description}</td>
                        <td className="px-3 py-2">{i.org_qty}</td>
                        <td className="px-3 py-2">{i.each_qty}</td>
                        <td className="px-3 py-2">{usd(i.unit_price)}</td>
                        <td className="px-3 py-2">{usd(i.extended)}</td>
                      </tr>
                    ))}
                  </Table>
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">What this order earned</h3>
                  {o.captura_found ? (
                    <Facts
                      rows={[
                        ["Customer paid (Captura order total)", usd(n(o.order_total))],
                        ["Of that, sales tax", usd(n(o.order_tax))],
                        ["Of that, shipping and handling", usd(n(o.order_shipping))],
                        ["Captura's fees", usd(n(o.order_fees))],
                        ...(labFees ? ([["Lab fees Captura took", usd(labFees)]] as [string, ReactNode][]) : []),
                        ...(n(o.order_refunded) ? ([["Refunded", usd(n(o.order_refunded))]] as [string, ReactNode][]) : []),
                        ["Net pay from Captura", <span key="net" className="font-semibold">{usd(net)}</span>],
                        ["Lab charge for this order", usd(lab)],
                        [
                          "Profit after lab",
                          net === null ? (
                            ""
                          ) : (
                            <span key="profit" className={net - lab < 0 ? "font-semibold text-risk" : "font-semibold text-ok"}>
                              {usd(Math.round((net - lab) * 100) / 100)}
                            </span>
                          ),
                        ],
                        ["Payment", [o.order_payment_status, o.order_pay_date ? `paid out ${formatDate(o.order_pay_date)}` : null].filter(Boolean).join(", ")],
                      ]}
                    />
                  ) : (
                    <p className="text-sm text-muted">
                      {o.captura_checked_at
                        ? "Captura has no order with this number. It is looked up again in a week."
                        : "Not looked up in Captura yet. It is read on the next invoice check."}
                    </p>
                  )}
                  <p className="mt-3 text-xs text-muted">
                    Lab charge is this order&apos;s lines on the invoice plus its share of the invoice&apos;s tax ({usd(o.products)} products, {usd(o.shipping)} shipping,{" "}
                    {usd(o.tax)} tax).
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
