import { describe, expect, it } from "vitest";
import { amountFor, explainAmount, planObligations, prepayTotals, readTerm } from "@/lib/delivery/terms";
import { buildCloseout, buildGalleryLive, closeoutDueOn, closeoutSeasons, readCloseoutDays } from "@/lib/delivery/drafts";

describe("league terms to obligations", () => {
  it("reads percent and per-order rebates", () => {
    expect(readTerm("20% Rebate")?.rule).toEqual({ rule: "percent_prepay", pct: 20 });
    expect(readTerm("15% Rebate")?.kind).toBe("rebate");
    expect(readTerm("$3 Rebate for Each Prepay Order")?.rule).toEqual({ rule: "per_prepay_order", per_order: 3 });
    expect(readTerm("Custom Rebate")?.rule).toEqual({ rule: "manual" });
  });

  it("reads sponsorships with and without an amount", () => {
    expect(readTerm("$500 Sponsorship")?.rule).toEqual({ rule: "fixed", amount: 500 });
    expect(readTerm("Blue & White Sponsorship - $1500")?.rule).toEqual({ rule: "fixed", amount: 1500 });
    expect(readTerm("$1,000 Sponsorship")?.rule).toEqual({ rule: "fixed", amount: 1000 });
    expect(readTerm("Platinum Level Sponsorship")?.rule).toEqual({ rule: "manual" });
    const noRebate = readTerm("Sponsorship - No Rebate");
    expect(noRebate?.kind).toBe("sponsorship");
    expect(noRebate?.title).toBe("Sponsorship");
  });

  it("reads charges to a league and facility fees", () => {
    const charge = readTerm("20X30 Poster of Club Composite - $75 charge to club");
    expect(charge).toMatchObject({ kind: "charge", direction: "owed_in", rule: { rule: "fixed", amount: 75 } });
    expect(readTerm("Rental Fee Reimbursement")?.kind).toBe("facility_fee");
  });

  it("leaves products and parent discounts out", () => {
    for (const t of ["Sponsor Plaques", "Coach / Player Photos", "20% Discount for Prepay Orders", "10% Discount on Orders over $25", "League Composite", "MM Promo"]) {
      expect(readTerm(t), t).toBeNull();
    }
  });

  it("plans one obligation per term, adds the delivery box, and never counts the free-text fields twice", () => {
    const planned = planObligations({
      services: ["20% Rebate", "$500 Sponsorship", "Sponsor Plaques", "20% Rebate"],
      rebate: "20%",
      sponsorship: "$500",
      delivery_method: "league_delivery",
    });
    expect(planned.map((p) => p.kind)).toEqual(["rebate", "sponsorship", "delivery_box"]);
  });

  it("uses the free-text fields when the terms list has nothing of that kind", () => {
    const planned = planObligations({ services: [], rebate: "10%", sponsorship: "TBD with board", delivery_method: "mailer" });
    expect(planned[0]).toMatchObject({ kind: "rebate", rule: { rule: "percent_prepay", pct: 10 }, term_key: "rebate:field" });
    expect(planned[1]).toMatchObject({ kind: "sponsorship", rule: { rule: "manual" } });
    expect(planned).toHaveLength(2);
  });
});

describe("amounts from the order ledger", () => {
  const orders = [
    { order_type: "prepay", status: "placed", subtotal: 50, discount: 5 },
    { order_type: "prepay", status: "placed", subtotal: 30, discount: null },
    { order_type: "prepay", status: "refunded", subtotal: 100, discount: 0 },
    { order_type: "gallery", status: "placed", subtotal: 999, discount: 0 },
  ];

  it("counts prepay sales before tax, refunds and gallery orders left out", () => {
    expect(prepayTotals(orders)).toEqual({ prepay_sales: 75, prepay_orders: 2 });
  });

  it("works out each rule", () => {
    const totals = prepayTotals(orders);
    expect(amountFor({ rule: "percent_prepay", pct: 20 }, totals)).toBe(15);
    expect(amountFor({ rule: "per_prepay_order", per_order: 3 }, totals)).toBe(6);
    expect(amountFor({ rule: "fixed", amount: 500 }, totals)).toBe(500);
    expect(amountFor({ rule: "manual" }, totals)).toBeNull();
    expect(amountFor({ rule: "percent_prepay", pct: 20 }, null)).toBeNull();
  });

  it("explains a rebate and warns about a shared gallery", () => {
    expect(explainAmount({ rule: "percent_prepay", pct: 20, prepay_sales: 75, prepay_orders: 2 })).toBe("20% of $75.00 prepay sales before tax (2 orders).");
    expect(explainAmount({ rule: "per_prepay_order", per_order: 3, prepay_orders: 2, shared_gallery: true })).toMatch(/shared with another job/);
  });
});

describe("delivery emails", () => {
  it("drafts the gallery-live notice with the parent kit", () => {
    const d = buildGalleryLive({
      company: "Photo Co",
      league: "River League",
      contactFirstName: "Pat",
      to: ["pat@example.com"],
      galleryLink: "https://example.com/g/river",
      coupon: "RIVER10",
      orderDeadline: "2027-05-09",
    });
    expect(d.subject).toBe("River League: photos are ready to view and order");
    expect(d.body).toContain("Hi Pat,");
    expect(d.body).toContain("https://example.com/g/river");
    expect(d.body).toContain("RIVER10");
    expect(d.body).toContain("Sun, May 9, 2027");
    expect(d.body).not.toContain("—");
  });

  it("leaves out the coupon and deadline lines when there are none", () => {
    const d = buildGalleryLive({ company: "Photo Co", league: "River League", contactFirstName: null, to: [], galleryLink: "https://example.com/g", coupon: null, orderDeadline: null });
    expect(d.body).toContain("Hi there,");
    expect(d.body).not.toMatch(/code|order by/i);
  });

  it("drafts the close-out asking for next season's date", () => {
    const d = buildCloseout({ company: "Photo Co", league: "River League", contactFirstName: "Pat", to: ["pat@example.com"], firstPhotoDay: "2027-04-17" });
    expect(d.subject).toBe("River League: thank you for Spring 2027");
    expect(d.body).toContain("Spring 2028");
    expect(d.body).toMatch(/better/);
  });

  it("dates the close-out from delivery and keeps the setting sensible", () => {
    expect(closeoutDueOn("2027-05-20", 14)).toBe("2027-06-03");
    expect(readCloseoutDays(21)).toBe(21);
    expect(readCloseoutDays("x")).toBe(14);
    expect(readCloseoutDays(0)).toBe(14);
    expect(closeoutSeasons(null)).toEqual({ season: "season", next: "next season" });
  });
});
