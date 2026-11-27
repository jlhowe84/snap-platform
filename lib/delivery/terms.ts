// What a league is owed (or owes) at close-out, read from its money terms and
// worked out from the order ledger. Pure: no network and no database, so the
// rules are tested on their own.
//
// A league's terms are short phrases on its page ("20% Rebate", "$500
// Sponsorship", "$3 Rebate for Each Prepay Order"). Each phrase that means
// money becomes one obligation. A phrase with no amount in it ("Custom
// Rebate", "Platinum Level Sponsorship") still becomes an obligation, with
// no amount, for the office to fill in. Phrases about products or parent
// discounts are not obligations and are left out.
//
// The rebate is a percent of prepay sales before tax (Josh, 2026-11-26, for
// now): Captura's subtotal less its discount, for prepay orders that were not
// refunded. Shipping and tax are never counted.

export type ObligationKind = "rebate" | "sponsorship" | "donation" | "facility_fee" | "delivery_box" | "charge" | "other";

export type Rule =
  | { rule: "percent_prepay"; pct: number }
  | { rule: "per_prepay_order"; per_order: number }
  | { rule: "fixed"; amount: number }
  | { rule: "manual" };

export type PlannedObligation = {
  kind: ObligationKind;
  direction: "owed_out" | "owed_in";
  title: string;
  /** The term it came from, as written. */
  basis: string;
  /** Stable per league term, so working the amounts out again updates the same row. */
  term_key: string;
  rule: Rule;
};

export type LeagueTerms = {
  services: string[];
  rebate: string | null;
  sponsorship: string | null;
  delivery_method: string | null;
};

const money = (s: string) => Number(s.replace(/,/g, ""));
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** One term phrase to an obligation, or null when it is not about money owed. */
export function readTerm(raw: string): PlannedObligation | null {
  const term = clean(raw);
  if (!term) return null;
  const key = (kind: string) => `${kind}:${term.toLowerCase()}`;
  // Parent discounts and products are not owed to anyone.
  if (/\bdiscount\b/i.test(term) && !/\brebate\b/i.test(term)) return null;

  let m = /\$\s?([\d,]+(?:\.\d{1,2})?)\s*rebate\s+(?:for|per)\s+(?:each\s+)?prepay\s+order/i.exec(term);
  if (m) return { kind: "rebate", direction: "owed_out", title: term, basis: term, term_key: key("rebate"), rule: { rule: "per_prepay_order", per_order: money(m[1]) } };

  m = /(\d{1,2}(?:\.\d+)?)\s*%\s*rebate/i.exec(term);
  if (m) return { kind: "rebate", direction: "owed_out", title: term, basis: term, term_key: key("rebate"), rule: { rule: "percent_prepay", pct: Number(m[1]) } };

  if (/\brebate\b/i.test(term) && !/\bno rebate\b/i.test(term)) {
    return { kind: "rebate", direction: "owed_out", title: term, basis: term, term_key: key("rebate"), rule: { rule: "manual" } };
  }

  m = /\$\s?([\d,]+(?:\.\d{1,2})?)\s*charge\s+to\s+(?:the\s+)?(?:club|league)/i.exec(term);
  if (m) return { kind: "charge", direction: "owed_in", title: term, basis: term, term_key: key("charge"), rule: { rule: "fixed", amount: money(m[1]) } };

  if (/\bsponsorship\b/i.test(term)) {
    m = /\$\s?([\d,]+(?:\.\d{1,2})?)/.exec(term);
    return {
      kind: "sponsorship",
      direction: "owed_out",
      title: /no rebate/i.test(term) ? "Sponsorship" : term,
      basis: term,
      term_key: key("sponsorship"),
      rule: m ? { rule: "fixed", amount: money(m[1]) } : { rule: "manual" },
    };
  }

  if (/\b(rental|facility|field)\b.*\b(fee|reimburse)/i.test(term)) {
    return { kind: "facility_fee", direction: "owed_out", title: term, basis: term, term_key: key("facility_fee"), rule: { rule: "manual" } };
  }
  if (/\bdonation\b/i.test(term)) {
    m = /\$\s?([\d,]+(?:\.\d{1,2})?)/.exec(term);
    return { kind: "donation", direction: "owed_out", title: term, basis: term, term_key: key("donation"), rule: m ? { rule: "fixed", amount: money(m[1]) } : { rule: "manual" } };
  }
  return null;
}

/**
 * Every obligation a league's terms call for. The free-text rebate and
 * sponsorship fields count only when the term list has nothing of that kind,
 * so the same money is never listed twice. League delivery adds a box to drop off.
 */
export function planObligations(terms: LeagueTerms): PlannedObligation[] {
  const planned: PlannedObligation[] = [];
  const seen = new Set<string>();
  for (const s of terms.services ?? []) {
    const p = readTerm(s);
    if (p && !seen.has(p.term_key)) {
      seen.add(p.term_key);
      planned.push(p);
    }
  }
  const has = (kind: ObligationKind) => planned.some((p) => p.kind === kind);
  const rebate = clean(terms.rebate ?? "");
  if (rebate && !has("rebate") && !/^(none|no|n\/a|-)$/i.test(rebate)) {
    const p = readTerm(/rebate/i.test(rebate) ? rebate : `${rebate} Rebate`);
    planned.push({
      ...(p ?? { kind: "rebate", direction: "owed_out", title: "Rebate", term_key: "rebate:field", rule: { rule: "manual" } }),
      kind: "rebate",
      basis: rebate,
      term_key: "rebate:field",
    });
  }
  const sponsorship = clean(terms.sponsorship ?? "");
  if (sponsorship && !has("sponsorship") && !/^(none|no|n\/a|-)$/i.test(sponsorship)) {
    const m = /\$\s?([\d,]+(?:\.\d{1,2})?)/.exec(sponsorship);
    planned.push({
      kind: "sponsorship",
      direction: "owed_out",
      title: "Sponsorship",
      basis: sponsorship,
      term_key: "sponsorship:field",
      rule: m ? { rule: "fixed", amount: money(m[1]) } : { rule: "manual" },
    });
  }
  if (terms.delivery_method === "league_delivery") {
    planned.push({ kind: "delivery_box", direction: "owed_out", title: "Drop off the league delivery box", basis: "League delivery", term_key: "delivery_box", rule: { rule: "manual" } });
  }
  return planned;
}

export type LedgerOrder = { order_type: string; status: string; subtotal: number | null; discount: number | null };

export type PrepayTotals = { prepay_sales: number; prepay_orders: number };

/** Prepay sales before tax (subtotal less discount) and the count, refunds left out. */
export function prepayTotals(orders: LedgerOrder[]): PrepayTotals {
  let sales = 0;
  let count = 0;
  for (const o of orders) {
    if (o.order_type !== "prepay" || o.status !== "placed") continue;
    sales += Number(o.subtotal ?? 0) - Number(o.discount ?? 0);
    count++;
  }
  return { prepay_sales: round2(sales), prepay_orders: count };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The amount a rule gives, or null when the office has to type it. */
export function amountFor(rule: Rule, totals: PrepayTotals | null): number | null {
  switch (rule.rule) {
    case "fixed":
      return round2(rule.amount);
    case "percent_prepay":
      return totals ? round2((totals.prepay_sales * rule.pct) / 100) : null;
    case "per_prepay_order":
      return totals ? round2(totals.prepay_orders * rule.per_order) : null;
    default:
      return null;
  }
}

/** How an amount was reached, in a sentence for the job page. */
export function explainAmount(c: { rule?: string; pct?: number; per_order?: number; prepay_sales?: number; prepay_orders?: number; shared_gallery?: boolean } | null): string | null {
  if (!c?.rule) return null;
  const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const shared = c.shared_gallery ? " The gallery is shared with another job, so these sales include that job's orders." : "";
  if (c.rule === "percent_prepay" && c.prepay_sales != null) return `${c.pct}% of ${usd(c.prepay_sales)} prepay sales before tax (${c.prepay_orders ?? 0} orders).${shared}`;
  if (c.rule === "per_prepay_order" && c.prepay_orders != null) return `${usd(c.per_order ?? 0)} for each of ${c.prepay_orders} prepay orders.${shared}`;
  if (c.rule === "fixed") return "The amount in the league's terms.";
  return null;
}

export const OBLIGATION_KIND_LABEL: Record<ObligationKind, string> = {
  rebate: "Rebate",
  sponsorship: "Sponsorship",
  donation: "Donation",
  facility_fee: "Facility fee",
  delivery_box: "Delivery box",
  charge: "Charge to league",
  other: "Other",
};
