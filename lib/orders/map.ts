import { createHash } from "node:crypto";

// Turns one Captura order into one ledger row. Pure: no network and no
// database, so every rule can be tested on its own. The mapping follows the
// SNAP OS order ledger (ingest_api_orders.py), which was checked against
// live Captura answers in September 2026.

type Raw = Record<string, unknown>;

const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};
const money = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const add = (...xs: (number | null)[]) => (xs.every((x) => x === null) ? null : Math.round(xs.reduce<number>((n, x) => n + (x ?? 0) * 100, 0)) / 100);
const id = (v: unknown): number | null => {
  const s = str(v);
  return s && /^\d{1,15}$/.test(s) ? Number(s) : null;
};

/** Rows Captura lists among orders that are money movements, not orders. */
export const ADJUSTMENT_TYPES = new Set(["refund", "chargeback", "chargeback-reversal", "planpayment", "vando-merchant-commission", "account-adjustment"]);

const PAYMENT: Record<string, "placed" | "refunded"> = {
  processed: "placed",
  disputeWon: "placed",
  disputePending: "placed",
  refunded: "refunded",
  disputeLost: "refunded",
};

// Captura's own order types, as Josh explained them on 2026-09-09: "vando" is
// a parent buying once the photos are posted, "blueprint" an order SNAP
// places itself, which is not a customer purchase.
const ORDER_TYPE: [string, OrderRow["order_type"]][] = [
  ["preorder", "prepay"],
  ["pre-order", "prepay"],
  ["prepay", "prepay"],
  ["vando", "gallery"],
  ["proof", "gallery"],
  ["blueprint", "internal"],
  ["reprint", "reprint"],
];
const DELIVERY: [string, OrderRow["delivery"]][] = [
  ["direct", "mailer"],
  ["league", "league"],
  ["bulk", "league"],
  ["mail", "mailer"],
  ["ship", "mailer"],
  ["home", "mailer"],
  ["pick", "pickup"],
  ["studio", "pickup"],
];
const SHIPMENT: [string, "pending" | "shipped" | "delivered"][] = [
  ["new", "pending"],
  ["hold", "pending"],
  ["process", "pending"],
  ["print", "pending"],
  ["ship", "shipped"],
  ["deliver", "delivered"],
  ["archiv", "delivered"],
  ["complete", "delivered"],
];
const SHIPMENT_RANK = { pending: 0, shipped: 1, delivered: 2 } as const;

function vocab<T extends string>(value: unknown, table: [string, T][]): T | "unknown" {
  const t = (str(value) ?? "").toLowerCase();
  if (!t) return "unknown";
  return table.find(([needle]) => t.includes(needle))?.[1] ?? "unknown";
}

/** An order split over several shipments is as far along as its slowest part. */
export function fulfillmentOf(statuses: (string | null)[]): OrderRow["fulfillment"] {
  const parts = statuses.map((s) => (s ?? "").trim().toLowerCase()).filter(Boolean);
  if (!parts.length) return "unknown";
  const seen = parts.map((p) => SHIPMENT.find(([needle]) => p.includes(needle))?.[1] ?? null);
  if (seen.some((s) => s === null)) return "unknown";
  return (seen as ("pending" | "shipped" | "delivered")[]).reduce((a, b) => (SHIPMENT_RANK[a] <= SHIPMENT_RANK[b] ? a : b));
}

/** Captura's times are UTC, sometimes with no zone marker. */
export function parseOrderTime(v: unknown): Date | null {
  const s = str(v);
  if (!s) return null;
  const withZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s.replace(" ", "T")}Z`;
  const d = new Date(withZone);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The calendar date of a moment in a time zone, as YYYY-MM-DD. */
export function dateIn(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** A one-way key for a buyer, so repeat buyers count without storing the email. */
export function buyerKey(companyId: string, email: string | null): string | null {
  const e = email?.trim().toLowerCase();
  if (!e || !e.includes("@")) return null;
  return createHash("sha256").update(`${companyId}:${e}`).digest("hex").slice(0, 16);
}

export type OrderRow = {
  company_id: string;
  order_id: number;
  gallery_id: number | null;
  ordered_at: string;
  order_date: string;
  order_type: "prepay" | "gallery" | "internal" | "reprint" | "unknown";
  status: "placed" | "refunded" | "unknown";
  payment_status: string | null;
  fulfillment: "pending" | "shipped" | "delivered" | "unknown";
  delivery: "league" | "mailer" | "pickup" | "unknown";
  subtotal: number | null;
  tax: number | null;
  shipping: number | null;
  handling: number | null;
  discount: number | null;
  total: number | null;
  refunded: number | null;
  background_fee: number | null;
  fees: number | null;
  lab_fees: number | null;
  net_pay: number | null;
  pay_date: string | null;
  lab_order_ids: string[];
  subject_ids: string[];
  buyer_key: string | null;
};

export type GalleryRow = { gallery_id: number; title: string | null };

export type Mapped =
  | { kind: "order"; row: OrderRow; gallery: GalleryRow | null }
  | { kind: "adjustment"; id: string | null; type: string }
  | { kind: "skip"; reason: string };

/**
 * One order from a Captura list or gallery call. The list answers with flat
 * orders carrying billTo; the single-order call wraps them, with billTo on
 * the wrapper, so the wrapper may be passed too.
 */
export function mapOrder(raw: unknown, companyId: string, timeZone: string, wrapper?: unknown): Mapped {
  const o = obj(raw);
  const type = str(o.orderType) ?? "";
  if (ADJUSTMENT_TYPES.has(type)) return { kind: "adjustment", id: str(o.id), type };
  const orderId = id(o.id);
  if (orderId === null) return { kind: "skip", reason: "no order id" };
  const at = parseOrderTime(o.orderDate);
  if (!at) return { kind: "skip", reason: "no order date" };

  const galleryOrders = arr(o.galleryOrders).map(obj);
  const g0 = galleryOrders[0] ?? {};
  const galleryId = id(g0.galleryID) ?? id(obj(g0.gallery).id);
  const shipments = arr(o.serviceOrders).map(obj);
  const refunded = money(o.amountRefunded);
  const email = str(obj(o.billTo).email) ?? str(obj(obj(wrapper).billTo).email);
  const payDate = str(o.payDate);

  return {
    kind: "order",
    gallery: galleryId === null ? null : { gallery_id: galleryId, title: str(obj(g0.gallery).title) },
    row: {
      company_id: companyId,
      order_id: orderId,
      gallery_id: galleryId,
      ordered_at: at.toISOString(),
      order_date: dateIn(at, timeZone),
      order_type: vocab(type, ORDER_TYPE),
      status: PAYMENT[str(o.paymentStatus) ?? ""] ?? "unknown",
      payment_status: str(o.paymentStatus),
      fulfillment: fulfillmentOf(shipments.map((s) => str(s.orderStatus) ?? str(s.status))),
      delivery: vocab(o.shipmentType, DELIVERY),
      subtotal: money(o.subtotal),
      tax: money(o.tax),
      shipping: money(o.shipping),
      handling: money(o.handling),
      discount: money(o.discount),
      total: money(o.total),
      // Captura sends refunds as a negative amount; the ledger keeps the size.
      refunded: refunded === null ? null : Math.abs(refunded),
      background_fee: money(o.backgroundFee),
      // On a card order processingFee already equals the commission.
      fees: add(money(o.processingFee) ?? money(o.commission), money(o.transactionFee), money(o.digitalProductFee)),
      lab_fees: add(money(o.labPrintingFee), money(o.labShippingFee)),
      net_pay: money(o.netPay) ?? money(o.photogNet),
      pay_date: payDate && /^\d{4}-\d{2}-\d{2}/.test(payDate) ? payDate.slice(0, 10) : null,
      lab_order_ids: [...new Set(shipments.map((s) => str(s.labOrderID)).filter((x): x is string => !!x))],
      subject_ids: [...new Set(galleryOrders.map((x) => str(x.subjectID)).filter((x): x is string => !!x))],
      buyer_key: buyerKey(companyId, email),
    },
  };
}
