// The makeup offer for a prepay order with no photos: a plain template filled
// with the order's facts, queued for a person to approve. No network and no
// database here. The wording is a company setting (prepay.makeup_offer); the
// text below is only what a company with no setting starts from.

export const MAKEUP_OFFER_KEY = "prepay.makeup_offer";
export const MAKEUP_OFFER_LABEL = "Makeup offer";
export const MAKEUP_OFFER_SETTING = "prepay.makeup_offer";

export type OfferTemplate = { subject: string; body: string };

export const DEFAULT_OFFER: OfferTemplate = {
  subject: "Your {company} preorder for {player}",
  body: [
    "Hi {parent},",
    "Thank you for your preorder. We are sorry we missed {player} on photo day for {league}, so we have no photos to go with order {order}.",
    "We would love to make it right with a makeup session. Reply to this email and we will set up a time that works for you.",
    "If a makeup session will not work, reply and let us know, and we will refund your order.",
    "Thank you,\n{company}",
  ].join("\n\n"),
};

/** The company's wording when it has saved one, else the starting text. */
export function readOfferTemplate(value: unknown): OfferTemplate {
  const v = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const text = (x: unknown, max: number) => (typeof x === "string" && x.trim() && x.length <= max ? x : null);
  return { subject: text(v.subject, 300) ?? DEFAULT_OFFER.subject, body: text(v.body, 10000) ?? DEFAULT_OFFER.body };
}

export type OfferFacts = {
  company: string;
  league: string | null;
  player: string | null;
  parentFirstName: string | null;
  orderId: number;
  to: string[];
  /** The booking page, with this order filled in. Empty when the company has no page. */
  bookingUrl?: string | null;
};

export function buildMakeupOffer(template: OfferTemplate, f: OfferFacts) {
  const words: Record<string, string> = {
    company: f.company,
    league: f.league ?? "your league",
    player: f.player ?? "your player",
    parent: f.parentFirstName ?? "there",
    order: String(f.orderId),
    booking: f.bookingUrl ?? "",
  };
  const fill = (s: string) => s.replace(/\{(company|league|player|parent|order|booking)\}/g, (_, k: string) => words[k]);
  return { to: f.to, subject: fill(template.subject).replace(/\s+/g, " ").trim().slice(0, 300), body: fill(template.body) };
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Who placed a Captura order: the billing email and first name, read from
 * the single-order answer (the checkout, or the bare order). Nothing else of
 * the buyer is kept.
 */
export function orderBuyer(raw: unknown, orderId: number): { email: string | null; firstName: string | null } {
  const data = obj(raw);
  const inner = arr(data.orders).map(obj).find((o) => String(o.id) === String(orderId));
  const billTo = [obj(data.billTo), obj(inner?.billTo), obj(data.shipTo)].find((b) => str(b.email)) ?? {};
  const email = str(billTo.email);
  const first = str(billTo.firstName) ?? str(billTo.name)?.split(/\s+/)[0] ?? null;
  return {
    email: email && /^[^\s"<>@,;]+@[^\s"<>@,;]+\.[^\s"<>@,;]+$/.test(email) ? email.toLowerCase() : null,
    firstName: first ? first.slice(0, 60) : null,
  };
}
