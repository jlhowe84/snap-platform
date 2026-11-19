import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Pill, Table } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { usd } from "@/lib/lab/costs";

export const metadata: Metadata = { title: "Lab invoice" };

export default async function LabInvoicePage({ params }: PageProps<"/lab/invoices/[id]">) {
  await requireStaff(OFFICE_ROLES);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: invoice }, { data: items }] = await Promise.all([
    supabase.from("lab_invoices").select("*, jobs(id, name)").eq("id", id).maybeSingle(),
    supabase.from("lab_invoice_items").select("position, description, org_qty, each_qty, unit_price, extended, shipping").eq("invoice_id", id).order("position"),
  ]);
  if (!invoice) notFound();
  const job = invoice.jobs as { id: string; name: string } | null;
  const facts: [string, React.ReactNode][] = [
    ["Lab", invoice.lab],
    ["Invoice date", formatDate(invoice.invoice_date)],
    ["Customer", invoice.customer_name ?? ""],
    ["Captura order (the lab's PO No)", invoice.captura_order_number ?? ""],
    ["Online order number", invoice.online_order_number ?? ""],
    ["Lab order number", invoice.lab_order_number ?? ""],
    ["Received by the lab", formatDate(invoice.received_date)],
    [
      "Lab job name",
      invoice.reference ? (
        <Link href={`/lab/invoices?ref=${encodeURIComponent(invoice.reference)}`} className="hover:text-accent">
          {invoice.reference}
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
  ];

  return (
    <>
      <PageHeader eyebrow="Lab invoice" title={invoice.invoice_number}>
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

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Details">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            {facts.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {invoice.drive_folder && <p className="mt-4 text-xs text-muted">Filed in the {invoice.drive_folder} folder as {invoice.file_name}.</p>}
        </Card>

        <Card title="What was charged">
          <Table head={["Item", "Qty", "Each", "Price", "Amount"]}>
            {(items ?? []).map((i) => (
              <tr key={i.position} className="border-b border-line last:border-0">
                <td className="px-3 py-2">{i.description}</td>
                <td className="px-3 py-2">{i.org_qty}</td>
                <td className="px-3 py-2">{i.each_qty}</td>
                <td className="px-3 py-2">{usd(i.unit_price)}</td>
                <td className="px-3 py-2">{usd(i.extended)}</td>
              </tr>
            ))}
          </Table>
          <dl className="mt-4 ml-auto grid w-fit grid-cols-[auto_auto] gap-x-8 gap-y-1 text-sm">
            <dt className="text-muted">Subtotal</dt>
            <dd className="text-right">{usd(invoice.subtotal)}</dd>
            <dt className="text-muted">Tax</dt>
            <dd className="text-right">{usd(invoice.tax)}</dd>
            <dt className="font-semibold">Total</dt>
            <dd className="text-right font-semibold">{usd(invoice.total)}</dd>
            {invoice.balance !== null && (
              <>
                <dt className="text-muted">Balance</dt>
                <dd className="text-right">{usd(invoice.balance)}</dd>
              </>
            )}
          </dl>
        </Card>
      </div>
    </>
  );
}
