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

export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
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
export function shapeOrder(raw: unknown, orderNumber: string, customerEmail: string | null): OrderFacts {
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

/** A line a person can read about what was found. */
export function orderSummary(o: OrderFacts): string {
  if (o.orders.length === 0) return `Order ${o.order_number}: found, with no details.`;
  const ships = o.orders.flatMap((x) => x.shipments);
  const state = ships.length ? ships.map((s) => s.status ?? "unknown").join(", ") : "no shipment yet";
  const owner = o.email_matches_customer ? "same email as the customer" : "under a different email than the customer";
  return `Order ${o.order_number}: payment ${o.orders[0].payment ?? "unknown"}, shipment ${state}, ${owner}.`;
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
  for (const g of arr(list)) {
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

export type PlayerSearch = { gallery: string | null; gallery_link: string; players: PlayerHit[]; more: number };

/**
 * Players in one gallery whose name holds every word searched for. Captura
 * has no subject search, so the whole gallery is read and matched here. The
 * gallery's image numbers are left out on purpose: they are not a count of a
 * child's photos and are never quoted to a customer.
 */
export function matchPlayers(rawGallery: unknown, galleryId: string, name: string, customerEmail: string | null, max = 5): PlayerSearch {
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
