import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { shapeOrder } from "@/lib/captura/shape";
import { formatDate, formatTime } from "@/lib/dates";
import { barcodeSvg } from "@/lib/makeups/barcode";
import { FOLLOW_UP, KIND_LABEL, type Kind } from "@/lib/makeups/schedule";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Photo slip", robots: { index: false } };
export const dynamic = "force-dynamic";

const SUPPORT_AND_OFFICE = [...OFFICE_ROLES, "support"] as const;
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// The photo slip for one makeup or retake: printed, handed to the
// photographer, and kept with the job until the follow-up boxes are ticked.
// The order's items are read from Captura (read-only) when it answers; the
// order ledger covers the rest.
export default async function PhotoSlip({ params }: PageProps<"/slip/[id]">) {
  const viewer = await requireStaff(SUPPORT_AND_OFFICE);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data: b } = await supabase
    .from("makeup_bookings")
    .select("*, jobs(name, organizations(name))")
    .eq("id", id)
    .maybeSingle();
  if (!b) notFound();

  const job = b.jobs as { name: string; organizations: { name: string } | null } | null;
  const league = b.league ?? job?.organizations?.name ?? job?.name ?? null;
  const { data: ledger } = b.order_number
    ? await supabase.from("captura_orders").select("order_id, order_date, order_type, status, delivery, total, refunded, payment_status").eq("order_id", b.order_number).maybeSingle()
    : { data: null };

  let items: string[] = [];
  if (b.order_number) {
    try {
      const { loadCapturaCredentials, createCapturaClient } = await import("@/lib/captura/client");
      const creds = await loadCapturaCredentials(viewer.companyId);
      if (creds) {
        const facts = shapeOrder(await createCapturaClient(creds).getOrder(b.order_number), String(b.order_number), b.email);
        items = (facts.orders.find((o) => o.id === String(b.order_number)) ?? facts.orders[0])?.items ?? [];
      }
    } catch {
      // The slip still prints without the item list.
    }
  }
  const barcode = b.online_code ? barcodeSvg(b.online_code) : null;
  const box = "inline-block h-5 w-5 shrink-0 border-2 border-black text-center text-sm font-bold leading-4";

  return (
    <div className="min-h-screen bg-white text-black print:min-h-0">
      <div className="mx-auto flex max-w-[7.5in] items-center justify-between gap-3 px-4 py-4 print:hidden">
        <Link href={`/production/makeups?date=${b.date}`} className="text-sm underline">
          ← Back to bookings
        </Link>
        <PrintButton />
      </div>

      <main className="mx-auto max-w-[7.5in] px-4 pb-10 print:px-0 print:pb-0">
        <div className="border-2 border-black p-5">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-black pb-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em]">{viewer.companyName}</p>
              <h1 className="text-3xl font-black uppercase tracking-wide">{KIND_LABEL[b.kind as Kind]} photo slip</h1>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold">{formatDate(b.date, { weekday: true })}</p>
              <p className="text-lg font-bold">{formatTime(b.start_time)}</p>
              {b.status !== "booked" && <p className="text-xs font-bold uppercase">{b.status === "cancelled" ? "Cancelled" : b.status === "done" ? "Photographed" : "Did not come"}</p>}
            </div>
          </header>

          <section className="grid grid-cols-1 gap-4 border-b-2 border-black py-4 sm:grid-cols-[1fr_auto] print:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider">Subject</p>
              <p className="text-3xl font-black leading-tight [overflow-wrap:anywhere]">{b.player}</p>
              <dl className="mt-3 grid grid-cols-[5.5rem_1fr] gap-y-1 text-base">
                <dt className="font-bold">League</dt>
                <dd className="[overflow-wrap:anywhere]">{league ?? <Blank />}</dd>
                <dt className="font-bold">Team</dt>
                <dd className="[overflow-wrap:anywhere]">{b.team ?? <Blank />}</dd>
                <dt className="font-bold">Parent</dt>
                <dd className="[overflow-wrap:anywhere]">{[b.parent_name, b.phone].filter(Boolean).join(" · ") || <Blank />}</dd>
              </dl>
            </div>
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-wider">Online code</p>
              {b.online_code ? (
                <>
                  <p className="font-mono text-3xl font-black tracking-widest">{b.online_code}</p>
                  {barcode && <div className="mx-auto mt-2 w-64 max-w-full [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: barcode }} />}
                </>
              ) : (
                <div className="mt-2 h-24 w-64 max-w-full border-2 border-dashed border-black/60 p-2 text-xs">Not found yet. Write the code here, or add it to the booking and print again.</div>
              )}
            </div>
          </section>

          <section className="border-b-2 border-black py-4">
            <p className="text-xs font-bold uppercase tracking-wider">Order</p>
            {!b.order_number ? (
              <p className="mt-1 text-base">No order on this booking.</p>
            ) : (
              <>
                <p className="mt-1 text-base">
                  <span className="font-mono text-xl font-black">{b.order_number}</span>
                  {ledger
                    ? ` · ${[ledger.order_type, ledger.order_date ? formatDate(ledger.order_date) : null, ledger.total != null ? money.format(Number(ledger.total)) : null, ledger.delivery, ledger.status].filter(Boolean).join(" · ")}`
                    : " · not in the order ledger"}
                  {ledger?.refunded ? ` · refunded ${money.format(Number(ledger.refunded))}` : ""}
                </p>
                {items.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-base">
                    {items.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                )}
              </>
            )}
          </section>

          <section className="border-b-2 border-black py-4">
            <p className="text-xs font-bold uppercase tracking-wider">Notes</p>
            {b.parent_note && <p className="mt-1 text-base">From the parent: {b.parent_note}</p>}
            {b.staff_note && <p className="mt-1 whitespace-pre-line text-base">{b.staff_note}</p>}
            <div className="mt-2 space-y-7 pt-5">
              {[0, 1, 2].map((i) => <div key={i} className="border-b border-black/70" />)}
            </div>
          </section>

          <section className="pt-4">
            <ul className="flex flex-wrap gap-x-6 gap-y-3 text-base font-bold">
              {FOLLOW_UP.map((f) => (
                <li key={f.key} className="flex items-center gap-2">
                  <span className={box}>{b[f.key] ? "✓" : ""}</span>
                  {f.label}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}

function Blank() {
  return <span className="inline-block w-48 border-b border-black/70 align-bottom">&nbsp;</span>;
}
