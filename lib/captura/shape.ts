// Turns Captura's large responses into the few facts a support reply needs.
// No network and no database here, so every rule can be tested on its own.
// Captura's live responses differ a little from its published spec, so
// nothing here assumes a field is present.

type Raw = Record<string, unknown>;

const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};
const day = (v: unknown): string | null => {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
};

/** One address or several: a customer can be known by more than one. */
export type Emails = string | null | undefined | readonly string[];

export function sameEmail(a: string | null | undefined, b: Emails): boolean {
  if (!a) return false;
  const mine = a.trim().toLowerCase();
  const theirs = typeof b === "string" ? [b] : (b ?? []);
  return theirs.some((x) => x.trim().toLowerCase() === mine);
}

function personName(p: Raw): string | null {
  const joined = [str(p.firstName), str(p.lastName)].filter(Boolean).join(" ");
  return joined || str(p.name);
}

export type OrderFacts = {
  order_number: string;
  /** True when the order's billing or shipping email is the customer's. */
  email_matches_customer: boolean;
  billed_to: string | null;
  orders: {
    id: string | null;
    ordered: string | null;
    type: string | null;
    payment: string | null;
    total: string | null;
    refunded: string | null;
    delivery: string | null;
    gallery: string | null;
    player: string | null;
    items: string[];
    shipments: { status: string | null; released_to_lab: string | null; ship_via: string | null; tracking: string | null }[];
  }[];
};

/** One checkout, without addresses, phone numbers or Captura's fee lines. */
export function shapeOrder(raw: unknown, orderNumber: string, customerEmail: Emails): OrderFacts {
  const data = obj(raw);
  const billTo = obj(data.billTo);
  const shipTo = obj(data.shipTo);
  // The single-order call may answer with the checkout or with the bare order.
  const inner = arr(data.orders).length > 0 ? arr(data.orders) : data.items || data.serviceOrders ? [data] : [];
  return {
    order_number: orderNumber,
    email_matches_customer: sameEmail(str(billTo.email), customerEmail) || sameEmail(str(shipTo.email), customerEmail),
    billed_to: personName(billTo),
    orders: inner.slice(0, 5).map((o) => {
      const order = obj(o);
      const first = obj(arr(order.galleryOrders)[0]);
      const subject = obj(first.subject);
      const refunded = Number(order.amountRefunded);
      return {
        id: str(order.id),
        ordered: day(order.orderDate),
        type: str(order.orderType),
        payment: str(order.paymentStatus),
        total: str(order.total),
        refunded: Number.isFinite(refunded) && refunded > 0 ? String(refunded) : null,
        delivery: str(order.shipmentType),
        gallery: str(first.title) ?? str(first.galleryTitle) ?? str(obj(first.gallery).title),
        player: personName(subject),
        items: arr(order.items)
          .slice(0, 12)
          .map((i) => {
            const item = obj(i);
            const qty = str(item.quantity);
            return [qty && qty !== "1" ? `${qty} x` : null, str(item.name) ?? "item"].filter(Boolean).join(" ");
          }),
        shipments: arr(order.serviceOrders)
          .slice(0, 6)
          .map((s) => {
            const ship = obj(s);
            return {
              // The spec says orderStatus; the live field is status.
              status: str(ship.status) ?? str(ship.orderStatus),
              released_to_lab: day(ship.releaseDate),
              ship_via: str(ship.shipVia),
              tracking: str(ship.trackingNumber),
            };
          }),
      };
    }),
  };
}

export type OrderMoney = {
  gallery_id: string | null;
  total: number | null;
  tax: number | null;
  shipping: number | null;
  refunded: number | null;
  /** What Captura kept: its commission and card processing. */
  fees: number | null;
  /** Lab charges Captura took out itself (its own lab); none when the lab bills SNAP. */
  lab_fees: number | null;
  net_pay: number | null;
  pay_date: string | null;
  payment_status: string | null;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const plus = (...xs: (number | null)[]) => (xs.every((x) => x === null) ? null : Math.round(xs.reduce<number>((n, x) => n + (x ?? 0) * 100, 0)) / 100);

/**
 * The money on one Captura order: what the customer paid and what Captura
 * paid out. The single-order call may wrap several orders of one checkout;
 * the one whose id is the order number is used, or the only one there is.
 * No names, addresses or items.
 */
export function orderMoney(raw: unknown, orderNumber: string): OrderMoney | null {
  const data = obj(raw);
  const inner = arr(data.orders).length > 0 ? arr(data.orders).map(obj) : data.id !== undefined || data.total !== undefined ? [data] : [];
  const order = inner.find((o) => str(o.id) === orderNumber) ?? (inner.length === 1 ? inner[0] : null);
  if (!order) return null;
  const galleries = new Set<string>();
  for (const g of arr(order.galleryOrders)) {
    const row = obj(g);
    const id = str(row.galleryID) ?? str(row.galleryId) ?? str(obj(row.gallery).id);
    if (id && /^\d{1,14}$/.test(id)) galleries.add(id);
  }
  // On a card order processingFee already equals commission, so it is not added to it.
  const fees = plus(num(order.processingFee) ?? num(order.commission), num(order.transactionFee), num(order.digitalProductFee));
  return {
    gallery_id: galleries.size === 1 ? [...galleries][0] : null,
    total: num(order.total),
    tax: num(order.tax),
    shipping: plus(num(order.shipping), num(order.handling)),
    refunded: num(order.amountRefunded),
    fees,
    lab_fees: plus(num(order.labPrintingFee), num(order.labShippingFee)),
    net_pay: num(order.netPay) ?? num(order.photogNet),
    pay_date: day(order.payDate),
    payment_status: str(order.paymentStatus),
  };
}

/** A line a person can read about what was found. */
export function orderSummary(o: OrderFacts): string {
  if (o.orders.length === 0) return `Order ${o.order_number}: found, with no details.`;
  const ships = o.orders.flatMap((x) => x.shipments);
  const state = ships.length ? ships.map((s) => s.status ?? "unknown").join(", ") : "no shipment yet";
  const owner = o.email_matches_customer ? "same email as the customer" : "under a different email than the customer";
  return `Order ${o.order_number}: payment ${o.orders[0].payment ?? "unknown"}, shipment ${state}, ${owner}.`;
}

/**
 * Captura's list calls answer with a page: { data: [...], total, start, end }.
 * Some answers are a bare list, so both are read.
 */
export function pageRows(page: unknown): { rows: unknown[]; total: number | null } {
  if (Array.isArray(page)) return { rows: page, total: null };
  const p = obj(page);
  const total = Number(p.total);
  return { rows: arr(p.data), total: Number.isFinite(total) ? total : null };
}

export type GalleryHit = { id: string; title: string; photo_day: string | null; status: string | null };

const words = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** Galleries whose title holds every word searched for. */
export function matchGalleries(list: unknown, search: string, max = 8): GalleryHit[] {
  const wanted = words(search);
  if (wanted.length === 0) return [];
  const out: GalleryHit[] = [];
  for (const g of pageRows(list).rows) {
    const gallery = obj(g);
    const id = str(gallery.id);
    const title = str(gallery.title);
    if (!id || !title) continue;
    const have = words(title);
    if (wanted.every((w) => have.some((h) => h.startsWith(w)))) {
      out.push({ id, title, photo_day: day(gallery.eventDate), status: str(gallery.status) });
      if (out.length >= max) break;
    }
  }
  return out;
}

export type PlayerHit = {
  name: string;
  team: string | null;
  access_code: string | null;
  gallery_link: string | null;
  expires: string | null;
  email_matches_customer: boolean;
};

export type PlayerSearch = { gallery: string | null; photo_day: string | null; gallery_link: string; players: PlayerHit[]; more: number };

/**
 * Players in one gallery whose name holds every word searched for. Captura
 * has no subject search, so the whole gallery is read and matched here. The
 * gallery's image numbers are left out on purpose: they are not a count of a
 * child's photos and are never quoted to a customer.
 */
export function matchPlayers(rawGallery: unknown, galleryId: string, name: string, customerEmail: Emails, max = 5): PlayerSearch {
  const gallery = obj(rawGallery);
  const teams = new Map<string, string>();
  for (const g of arr(gallery.groups)) {
    const group = obj(g);
    const id = str(group.id);
    const title = str(group.name) ?? str(group.title);
    if (id && title) teams.set(id, title);
  }
  const wanted = words(name);
  const hits: PlayerHit[] = [];
  if (wanted.length > 0) {
    for (const s of arr(gallery.subjects)) {
      const subject = obj(s);
      const full = personName(subject);
      if (!full) continue;
      const have = words(full);
      if (!wanted.every((w) => have.some((h) => h.startsWith(w)))) continue;
      const code = str(subject.onlineCode);
      const team = arr(subject.galleryGroups)
        .map((g) => teams.get(str(typeof g === "object" ? obj(g).id : g) ?? ""))
        .filter(Boolean)
        .join(", ");
      hits.push({
        name: full,
        team: team || null,
        access_code: code,
        gallery_link: code ? `https://shop.imagequix.com/s${encodeURIComponent(code)}` : null,
        expires: day(subject.expirationDate),
        email_matches_customer: sameEmail(str(subject.email), customerEmail),
      });
    }
  }
  return {
    gallery: str(gallery.title),
    photo_day: day(gallery.eventDate),
    gallery_link: `https://shop.imagequix.com/g${encodeURIComponent(galleryId)}`,
    players: hits.slice(0, max),
    more: Math.max(hits.length - max, 0),
  };
}

export function playerSummary(found: PlayerSearch, name: string): string {
  const where = found.gallery ?? "that gallery";
  if (found.players.length === 0) return `Player "${name}" in ${where}: no match.`;
  const total = found.players.length + found.more;
  return `Player "${name}" in ${where}: ${total} ${total === 1 ? "match" : "matches"}${total === 1 ? ` (${found.players[0].name})` : ""}.`;
}
