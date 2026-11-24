// The makeup offer for a prepay order with no photos: a plain template filled
// with the order's facts, queued for a person to approve. No network and no
// database here. The wording is a company setting (prepay.makeup_offer),
// edited in Settings, Messages; the starting text is in lib/messages/catalog.ts.

import { fillTemplate, messageDef, readTemplate, type Template } from "@/lib/messages/catalog";

export const MAKEUP_OFFER_KEY = "prepay.makeup_offer";
export const MAKEUP_OFFER_LABEL = "Makeup offer";
export const MAKEUP_OFFER_SETTING = "prepay.makeup_offer";

export type OfferTemplate = Template;

const OFFER = messageDef(MAKEUP_OFFER_KEY)!;
export const DEFAULT_OFFER: OfferTemplate = { subject: OFFER.subject, body: OFFER.body };

/** The company's wording when it has saved one, else the starting text. */
export function readOfferTemplate(value: unknown): OfferTemplate {
  const { subject, body } = readTemplate(OFFER, value);
  return { subject, body };
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
  return { to: f.to, ...fillTemplate(template, words) };
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
