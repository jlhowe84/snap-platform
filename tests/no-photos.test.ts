import { describe, expect, it } from "vitest";
import { findNoPhotoOrders, readGalleryPlayers, type PrepayOrder } from "@/lib/production/no-photos";

const gallery = {
  groups: [{ id: 7, name: "Tigers", images: [{ filename: "Tigers_COMP.jpg" }] }, { id: 8, name: "Bears" }],
  subjects: [
    { id: 1001, subjectID: "r1", firstName: "Ana", lastName: "Stone", galleryGroups: [7], images: [{ filename: "A_IND.jpg" }, { filename: "A_T.jpg" }] },
    { id: 1002, subjectID: "r2", firstName: "Ben", lastName: "Poe", galleryGroups: [7], images: [] },
    { id: 1003, subjectID: "r3", firstName: "Cy", lastName: "Reed", galleryGroups: [{ id: 8 }] },
    { subjectID: "r4", firstName: "No", lastName: "Id" },
  ],
};
const order = (id: number, subject_ids: string[], more: Partial<PrepayOrder> = {}): PrepayOrder => ({
  order_id: id, order_type: "prepay", status: "placed", total: 40, refunded: null, order_date: "2026-10-01", subject_ids, ...more,
});

describe("gallery players", () => {
  it("reads who has images, their team, and skips a record with no id", () => {
    const g = readGalleryPlayers(gallery);
    expect(g.players).toBe(3);
    expect(g.withImages).toBe(1);
    expect(g.byId.get("1001")).toEqual({ name: "Ana Stone", team: "Tigers", hasImages: true });
    expect(g.byId.get("1003")).toEqual({ name: "Cy Reed", team: "Bears", hasImages: false });
    // The roster's own id finds the player too.
    expect(g.byId.get("r2")?.name).toBe("Ben Poe");
  });
  it("reads nothing from an answer that is not a gallery", () => {
    expect(readGalleryPlayers(null).players).toBe(0);
    expect(readGalleryPlayers({ subjects: "x" }).players).toBe(0);
  });
});

describe("prepay orders with no photos", () => {
  const g = readGalleryPlayers(gallery);
  it("lists the orders whose player has no images, with the reason", () => {
    const r = findNoPhotoOrders([order(1, ["1001"]), order(2, ["1002"]), order(3, []), order(4, ["9999"]), order(5, ["1001", "1003"])], g);
    expect(r.ready).toBe(true);
    if (!r.ready) return;
    expect(r.prepay).toBe(5);
    expect(r.withPhotos).toBe(1);
    expect(r.missing.map((m) => [m.order_id, m.reason, m.player])).toEqual([
      [2, "no_images", "Ben Poe"],
      [5, "no_images", "Cy Reed"],
      [3, "no_player", null],
      [4, "not_in_gallery", null],
    ]);
  });
  it("leaves out gallery orders, SNAP's own orders and refunded orders", () => {
    const r = findNoPhotoOrders(
      [order(1, ["1002"], { order_type: "gallery" }), order(2, ["1002"], { order_type: "internal" }), order(3, ["1002"], { status: "refunded" }), order(4, ["1002"], { refunded: 40 }), order(5, ["1002"], { refunded: 5 })],
      g,
    );
    expect(r.ready && r.missing.map((m) => m.order_id)).toEqual([5]);
  });
  it("says nothing until the gallery holds images", () => {
    const empty = readGalleryPlayers({ subjects: [{ id: 1, images: [] }, { id: 2 }] });
    expect(findNoPhotoOrders([order(1, ["1"])], empty)).toEqual({ ready: false, why: "no_images_yet", prepay: 1 });
    expect(findNoPhotoOrders([order(1, ["1"])], readGalleryPlayers({}))).toEqual({ ready: false, why: "no_players", prepay: 1 });
  });
});

import { buildMakeupOffer, DEFAULT_OFFER, orderBuyer, readOfferTemplate } from "@/lib/production/makeup-offer";

describe("makeup offer", () => {
  const facts = { company: "Photo Co", league: "River League", player: "Ben Poe", parentFirstName: "Dana", orderId: 60000001, to: ["dana@example.com"] };
  it("fills the starting wording with the order's facts", () => {
    const d = buildMakeupOffer(DEFAULT_OFFER, facts);
    expect(d.to).toEqual(["dana@example.com"]);
    expect(d.subject).toBe("Your Photo Co preorder for Ben Poe");
    expect(d.body).toContain("Hi Dana,");
    expect(d.body).toContain("we missed Ben Poe on photo day for River League");
    expect(d.body).toContain("order 60000001");
    expect(d.body).not.toMatch(/\{\w+\}/);
  });
  it("still reads well with no names", () => {
    const d = buildMakeupOffer(DEFAULT_OFFER, { ...facts, player: null, parentFirstName: null, league: null });
    expect(d.body).toContain("Hi there,");
    expect(d.subject).toBe("Your Photo Co preorder for your player");
  });
  it("uses the company's saved wording, and the starting text when a part is missing", () => {
    expect(readOfferTemplate({ subject: "About {player}", body: "Hello {parent}" })).toEqual({ subject: "About {player}", body: "Hello {parent}" });
    expect(readOfferTemplate({ subject: "", body: 5 })).toEqual(DEFAULT_OFFER);
    expect(readOfferTemplate(null)).toEqual(DEFAULT_OFFER);
  });
  it("reads the buyer from a checkout or a bare order, and nothing but email and first name", () => {
    expect(orderBuyer({ billTo: { firstName: "Dana", lastName: "Poe", email: "Dana@Example.com", phone: "555" }, orders: [{ id: 7 }] }, 7)).toEqual({ email: "dana@example.com", firstName: "Dana" });
    expect(orderBuyer({ orders: [{ id: 7, billTo: { name: "Dana Poe", email: "d@example.com" } }] }, 7)).toEqual({ email: "d@example.com", firstName: "Dana" });
    expect(orderBuyer({ billTo: { email: "not an address" } }, 7)).toEqual({ email: null, firstName: null });
    expect(orderBuyer(null, 7)).toEqual({ email: null, firstName: null });
  });
});
