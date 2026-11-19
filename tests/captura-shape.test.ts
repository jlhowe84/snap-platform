import { describe, expect, it } from "vitest";
import { matchGalleries, matchPlayers, orderSummary, pageRows, playerSummary, shapeOrder } from "@/lib/captura/shape";

const order = {
  billTo: { firstName: "Pat", lastName: "Parent", email: "Pat@Example.org", phone: "555-0100", address1: "1 Main St" },
  shipTo: { email: "other@example.org", address1: "1 Main St" },
  orders: [
    {
      id: 5001,
      orderDate: "2026-11-02T14:03:00Z",
      orderType: "vando",
      paymentStatus: "processed",
      total: 42.5,
      amountRefunded: 0,
      commission: 6.1,
      shipmentType: "direct",
      galleryOrders: [{ galleryID: 77, title: "Example League Fall 2026", subject: { firstName: "Sam", lastName: "Parent" } }],
      items: [{ name: "(4) Wallets", quantity: 1, type: "product" }, { name: "8x10", quantity: 2 }],
      serviceOrders: [{ status: "shipped", releaseDate: "2026-11-05T00:00:00Z", shipVia: "USPS", trackingNumber: "9400" }, { orderStatus: "new" }],
    },
  ],
};

describe("captura facts for a support reply", () => {
  it("keeps what a reply needs and drops addresses, phones and fees", () => {
    const facts = shapeOrder(order, "5001", "pat@example.org");
    expect(facts.email_matches_customer).toBe(true);
    expect(facts.billed_to).toBe("Pat Parent");
    expect(facts.orders[0]).toMatchObject({
      ordered: "2026-11-02",
      payment: "processed",
      total: "42.5",
      refunded: null,
      gallery: "Example League Fall 2026",
      player: "Sam Parent",
      items: ["(4) Wallets", "2 x 8x10"],
    });
    expect(facts.orders[0].shipments).toEqual([
      { status: "shipped", released_to_lab: "2026-11-05", ship_via: "USPS", tracking: "9400" },
      { status: "new", released_to_lab: null, ship_via: null, tracking: null },
    ]);
    const text = JSON.stringify(facts);
    expect(text).not.toContain("Main St");
    expect(text).not.toContain("555-0100");
    expect(text).not.toContain("commission");
    expect(orderSummary(facts)).toBe("Order 5001: payment processed, shipment shipped, new, same email as the customer.");
  });

  it("flags an order under another email and survives odd shapes", () => {
    expect(shapeOrder(order, "5001", "someone@example.com").email_matches_customer).toBe(false);
    expect(orderSummary(shapeOrder(order, "5001", null))).toContain("under a different email");
    expect(shapeOrder(null, "9", null).orders).toEqual([]);
    expect(shapeOrder({ id: 9, paymentStatus: "refunded", amountRefunded: 10, items: [] }, "9", null).orders[0]).toMatchObject({ payment: "refunded", refunded: "10" });
  });

  it("matches galleries on every word", () => {
    const list = [
      { id: 77, title: "Example League Fall 2026", eventDate: "2026-09-12T00:00:00Z", status: "active" },
      { id: 78, title: "Example League Spring 2026" },
      { id: 79, title: "Other Club Fall 2026" },
      { title: "No id" },
    ];
    expect(matchGalleries(list, "example fall")).toEqual([{ id: "77", title: "Example League Fall 2026", photo_day: "2026-09-12", status: "active" }]);
    expect(matchGalleries(list, "2026", 2)).toHaveLength(2);
    expect(matchGalleries(list, "  ")).toEqual([]);
    expect(matchGalleries("nope", "x")).toEqual([]);
    // The live list call wraps its rows in a page.
    expect(matchGalleries({ data: list, total: 4, start: 1, end: 100 }, "example fall")).toHaveLength(1);
    expect(pageRows({ data: list, total: 4 })).toEqual({ rows: list, total: 4 });
    expect(pageRows(list).total).toBeNull();
  });

  it("finds a player with code, link and team, and never an image count", () => {
    const gallery = {
      title: "Example League Fall 2026",
      groups: [{ id: 1, name: "U10 Red" }],
      subjects: [
        { id: 900, firstName: "Sam", lastName: "Parent", onlineCode: "AB12CD", galleryGroups: [1], images: [1, 2, 3], numImages: 8, email: "pat@example.org", expirationDate: "2027-01-31T00:00:00Z" },
        { id: 901, firstName: "Samantha", lastName: "Parent-Jones", onlineCode: "ZZ99", galleryGroups: [{ id: 1 }] },
        { id: 902, firstName: "José", lastName: "Núñez", onlineCode: "JN01" },
      ],
    };
    const one = matchPlayers(gallery, "77", "Sam Parent", "PAT@example.org");
    expect(one.players).toHaveLength(2);
    expect(one.players[0]).toEqual({ name: "Sam Parent", team: "U10 Red", access_code: "AB12CD", gallery_link: "https://shop.imagequix.com/sAB12CD", expires: "2027-01-31", email_matches_customer: true });
    expect(one.players[1].team).toBe("U10 Red");
    expect(one.gallery_link).toBe("https://shop.imagequix.com/g77");
    expect(JSON.stringify(one)).not.toMatch(/images|numImages/);
    expect(matchPlayers(gallery, "77", "sam parent", ["forms@example.com", "pat@example.org"]).players[0].email_matches_customer).toBe(true);
    expect(matchPlayers(gallery, "77", "jose nunez", null).players[0].access_code).toBe("JN01");
    expect(matchPlayers(gallery, "77", "Nobody", null).players).toEqual([]);
    expect(matchPlayers(gallery, "77", "parent", null, 1)).toMatchObject({ more: 1 });
    expect(playerSummary(matchPlayers(gallery, "77", "jose", null), "jose")).toBe('Player "jose" in Example League Fall 2026: 1 match (José Núñez).');
    expect(playerSummary(matchPlayers(gallery, "77", "x y", null), "x y")).toContain("no match");
  });
});
