import { describe, expect, it } from "vitest";
import { buyerKey, dateIn, fulfillmentOf, mapOrder, parseOrderTime } from "@/lib/orders/map";
import { historyWindow, orderSettings, shiftDay } from "@/lib/orders/plan";
import { change, comparisons, galleryLines, seasonsOf, sum, yearBefore, type GalleryTotal } from "@/lib/orders/view";

const CO = "a0000000-0000-0000-0000-00000000000a";
const TZ = "America/New_York";

// Shaped like a live Captura list answer (September 2026), with made-up values.
const order = {
  id: 60739273,
  orderDate: "2026-09-14T02:05:00.000",
  orderType: "preorder",
  shipmentType: "pickup",
  paymentStatus: "processed",
  subtotal: 45.0,
  tax: 2.7,
  shipping: 0,
  handling: 1.0,
  total: 48.7,
  discount: 0,
  commission: 3.77,
  transactionFee: 1.56,
  processingFee: 3.77,
  labPrintingFee: 0,
  labShippingFee: 0,
  netPay: 43.37,
  backgroundFee: 0,
  amountRefunded: -10.5,
  payDate: "2026-09-20T00:00:00.000Z",
  billTo: { email: "Parent@Example.com" },
  serviceOrders: [
    { id: 1, orderStatus: "new", labOrderID: null },
    { id: 2, orderStatus: "shipped", labOrderID: "M123" },
  ],
  galleryOrders: [{ id: 5, galleryID: 1001409700, subjectID: 77, gallery: { id: 1001409700, title: "2026 Sample League" } }],
};

describe("mapOrder", () => {
  it("maps a Captura order to a ledger row", () => {
    const m = mapOrder(order, CO, TZ);
    expect(m.kind).toBe("order");
    if (m.kind !== "order") return;
    const r = m.row;
    expect(r.order_id).toBe(60739273);
    expect(r.gallery_id).toBe(1001409700);
    expect(m.gallery).toEqual({ gallery_id: 1001409700, title: "2026 Sample League" });
    // 02:05 UTC on the 14th is the evening of the 13th in Eastern time.
    expect(r.order_date).toBe("2026-09-13");
    expect(r.ordered_at).toBe("2026-09-14T02:05:00.000Z");
    expect(r.order_type).toBe("prepay");
    expect(r.status).toBe("placed");
    expect(r.fulfillment).toBe("pending");
    expect(r.delivery).toBe("pickup");
    expect(r.total).toBe(48.7);
    expect(r.refunded).toBe(10.5);
    expect(r.fees).toBe(5.33);
    expect(r.net_pay).toBe(43.37);
    expect(r.pay_date).toBe("2026-09-20");
    expect(r.lab_order_ids).toEqual(["M123"]);
    expect(r.subject_ids).toEqual(["77"]);
    expect(r.buyer_key).toMatch(/^[0-9a-f]{16}$/);
    expect(r.buyer_key).toBe(buyerKey(CO, "parent@example.com"));
    expect(JSON.stringify(r)).not.toContain("example.com");
  });

  it("knows Captura's order types", () => {
    const type = (t: string) => {
      const m = mapOrder({ ...order, orderType: t }, CO, TZ);
      return m.kind === "order" ? m.row.order_type : m.kind;
    };
    expect(type("vando")).toBe("gallery");
    expect(type("blueprint")).toBe("internal");
    expect(type("reprint")).toBe("reprint");
    expect(type("something-new")).toBe("unknown");
    expect(type("refund")).toBe("adjustment");
    expect(type("chargeback")).toBe("adjustment");
  });

  it("reads refunds and disputes as refunded", () => {
    const status = (s: string) => {
      const m = mapOrder({ ...order, paymentStatus: s }, CO, TZ);
      return m.kind === "order" ? m.row.status : null;
    };
    expect(status("refunded")).toBe("refunded");
    expect(status("disputeLost")).toBe("refunded");
    expect(status("disputePending")).toBe("placed");
    expect(status("odd")).toBe("unknown");
  });

  it("skips rows with no id or date, and takes billTo from the wrapper", () => {
    expect(mapOrder({ ...order, id: undefined }, CO, TZ).kind).toBe("skip");
    expect(mapOrder({ ...order, orderDate: "" }, CO, TZ).kind).toBe("skip");
    const m = mapOrder({ ...order, billTo: undefined }, CO, TZ, { billTo: { email: "parent@example.com" } });
    expect(m.kind === "order" && m.row.buyer_key).toBe(buyerKey(CO, "parent@example.com"));
  });
});

describe("order helpers", () => {
  it("folds shipments to the slowest", () => {
    expect(fulfillmentOf(["shipped", "delivered"])).toBe("shipped");
    expect(fulfillmentOf(["archived"])).toBe("delivered");
    expect(fulfillmentOf(["shipped", "weird"])).toBe("unknown");
    expect(fulfillmentOf([])).toBe("unknown");
  });

  it("reads times with and without a zone", () => {
    expect(parseOrderTime("2026-03-01 15:00:00")?.toISOString()).toBe("2026-03-01T15:00:00.000Z");
    expect(parseOrderTime("2026-03-01T15:00:00-05:00")?.toISOString()).toBe("2026-03-01T20:00:00.000Z");
    expect(parseOrderTime("nope")).toBeNull();
    expect(dateIn(new Date("2026-03-01T04:59:00Z"), TZ)).toBe("2026-02-28");
  });

  it("keys buyers per company, ignoring case", () => {
    expect(buyerKey(CO, " A@B.com ")).toBe(buyerKey(CO, "a@b.com"));
    expect(buyerKey("other", "a@b.com")).not.toBe(buyerKey(CO, "a@b.com"));
    expect(buyerKey(CO, null)).toBeNull();
  });
});

describe("sync plan", () => {
  it("reads settings with safe defaults", () => {
    expect(orderSettings([])).toEqual({ enabled: false, historyFrom: null, recentDays: 3 });
    expect(orderSettings([{ key: "orders.sync_enabled", value: true }, { key: "orders.history_from", value: "2025-02-01" }, { key: "orders.recent_days", value: 99 }])).toEqual({
      enabled: true,
      historyFrom: "2025-02-01",
      recentDays: 3,
    });
  });

  it("walks the history a week at a time up to the recent days", () => {
    expect(historyWindow("2025-02-01", "2026-11-17")).toEqual({ from: "2025-02-01", to: "2025-02-07", next: "2025-02-08" });
    expect(historyWindow("2026-11-14", "2026-11-17")).toEqual({ from: "2026-11-14", to: "2026-11-16", next: "2026-11-17" });
    expect(historyWindow("2026-11-17", "2026-11-17")).toBeNull();
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("orders view", () => {
  it("compares with the same days a year earlier", () => {
    const days = [
      { order_date: "2026-11-18", orders: 3, prepay_orders: 1, gross: "30.00", net_pay: "27.00" },
      { order_date: "2025-11-18", orders: 2, prepay_orders: 0, gross: "20.00", net_pay: "18.00" },
      { order_date: "2025-11-01", orders: 1, prepay_orders: 0, gross: "5.00", net_pay: "4.00" },
    ];
    const [week, month, year] = comparisons(days, "2026-11-20", "2024-01-01");
    expect(week.now).toMatchObject({ orders: 3, gross: 30 });
    expect(week.before).toMatchObject({ orders: 2, gross: 20 });
    expect(month.before.gross).toBe(25);
    expect(year.now.gross).toBe(30);
    expect(year.before.gross).toBe(25);
    expect(year.complete).toBe(true);
    expect(comparisons(days, "2026-11-20", "2026-01-01")[2].complete).toBe(false);
    expect(change(30, 20)).toBe(50);
    expect(change(5, 0)).toBeNull();
    expect(yearBefore("2028-02-29")).toBe("2027-02-28");
  });

  it("puts galleries in the season of their job, or of their first order", () => {
    const base: Omit<GalleryTotal, "gallery_id" | "job_id" | "first_order_on"> = {
      title: "G",
      job_name: null,
      last_order_on: null,
      orders: 2,
      prepay_orders: 1,
      gallery_orders: 1,
      refunded_orders: 0,
      internal_orders: 0,
      gross: "10.00",
      refunded: "0",
      net_pay: "9.00",
      buyers: 2,
    };
    const lines = galleryLines(
      [
        { ...base, gallery_id: 1, job_id: "j1", first_order_on: "2026-02-20" },
        { ...base, gallery_id: 2, job_id: null, first_order_on: "2026-09-01" },
        { ...base, gallery_id: 3, job_id: null, first_order_on: "2026-09-01", orders: 0 },
      ],
      new Map([["j1", "2026-04-11"]]),
    );
    expect(lines.map((l) => [l.galleryId, l.season])).toEqual([
      [1, "Spring 2026"],
      [2, "Fall 2026"],
    ]);
    expect(seasonsOf(lines)).toEqual(["Fall 2026", "Spring 2026"]);
    expect(sum(lines)).toMatchObject({ orders: 4, gross: 20, netPay: 18 });
  });
});

import { acronym, likelyJobs, likelyOptions, nameWords } from "@/lib/orders/match";

describe("matching a gallery to its jobs", () => {
  const jobs = [
    { id: "g1", name: "Genesis Hockey Club", firstDay: "2026-10-19" },
    { id: "g2", name: "Genesis Hockey Club", firstDay: "2026-10-20" },
    { id: "f1", name: "Flyers Youth Hockey Club", firstDay: "2026-12-01" },
    { id: "q1", name: "QFCA", firstDay: "2026-09-01" },
    { id: "r1", name: "Spring-Ford Rams Football & Cheer", firstDay: "2026-09-28" },
    { id: "r0", name: "Spring-Ford Rams Football & Cheer", firstDay: "2025-09-28" },
    { id: "l1", name: "Spring-Ford Youth Lacrosse", firstDay: "2026-04-07" },
    { id: "n1", name: "Nothing Yet", firstDay: null },
  ];

  it("reads the telling words of a name", () => {
    expect(nameWords("2026 Spring-Ford Rams Football and Cheer")).toEqual(["spring", "ford", "rams", "football", "cheer"]);
    expect(acronym("2026 Quakertown Football & Cheer Association")).toBe("qfca");
  });

  it("finds the jobs of the same league and season", () => {
    const hit = likelyJobs({ title: "2026 Genesis Hockey Club", firstOrder: "2026-10-07", lastOrder: "2026-11-19" }, jobs);
    expect(hit.map((j) => j.id)).toEqual(["g1", "g2"]);
  });

  it("keeps other years and other sports of the league out", () => {
    const hit = likelyJobs({ title: "2026 Spring-Ford Rams Football and Cheer", firstOrder: "2026-09-14", lastOrder: "2026-11-18" }, jobs);
    expect(hit.map((j) => j.id)).toEqual(["r1"]);
  });

  it("matches a job named by its initials", () => {
    const hit = likelyJobs({ title: "2026 Quakertown Football & Cheer Association", firstOrder: "2026-08-20", lastOrder: "2026-11-01" }, jobs);
    expect(hit.map((j) => j.id)).toEqual(["q1"]);
  });

  it("offers every photo day of one league as a single choice", () => {
    const options = likelyOptions(jobs.slice(0, 2), (d) => d);
    expect(options[0]).toEqual({ id: "g1,g2", label: "Genesis Hockey Club · all 2 photo days (2026-10-19 to 2026-10-20)" });
    expect(options).toHaveLength(3);
  });
});
