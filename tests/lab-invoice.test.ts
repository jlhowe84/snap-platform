import { describe, expect, it, vi } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { monthFolder, orderCosts, parseInvoices, toLines, type TextItem } from "@/lib/lab/invoice-parse";

vi.mock("server-only", () => ({}));

// The layout of a real lab invoice, with made-up people and numbers.
const page = (o: { number: string; ship?: string[]; reference: string[]; items: [string, number, number, string, string][]; extra?: TextItem[] }): TextItem[] => {
  const out: TextItem[] = [
    { x: 525, y: 689, text: "Page 1 of 1" },
    { x: 432, y: 664, text: "INVOICE" },
    { x: 518, y: 664, text: o.number },
    { x: 60, y: 628, text: "Bill To:" },
    { x: 432, y: 628, text: "Ship To:" },
    { x: 60, y: 616, text: "Example Photo Co" },
    { x: 354, y: 616, text: "2000001" },
    { x: 432, y: 616, text: "Pat Sample" },
    { x: 60, y: 604, text: "1 Main Street" },
    { x: 432, y: 604, text: "22 Test Lane" },
    { x: 60, y: 532, text: "Client Phone:" },
    { x: 246, y: 532, text: "Terms :" },
    { x: 300, y: 532, text: "COD" },
    { x: 60, y: 520, text: "Client No.:" },
    { x: 120, y: 520, text: "10001" },
    { x: 432, y: 520, text: "Invoice Date:" },
    { x: 492, y: 520, text: "11/19/2026" },
    { x: 60, y: 489, text: "Order" },
    { x: 120, y: 489, text: "Item Description" },
    { x: 360, y: 489, text: "Org." },
    { x: 393, y: 489, text: "Each" },
    { x: 480, y: 489, text: "Unit" },
    { x: 504, y: 489, text: "Tax" },
    { x: 543, y: 489, text: "Extended" },
    { x: 62, y: 467, text: "2070001" },
    { x: 120, y: 467, text: "Received: 11/17/2026 Online Order No: IQ80000001; PO No: 70000001;" },
  ];
  let y = 451;
  o.reference.forEach((line, k) => {
    out.push({ x: 120, y, text: k === 0 ? `Reference: ${line}` : line });
    y -= 12;
  });
  out.push({ x: 120, y: (y -= 11), text: "For:Pat Sample" });
  for (const [description, org, each, unit, extended] of o.items) {
    y -= 18;
    const [first, ...rest] = description.split("\n");
    out.push({ x: 120, y, text: first }, { x: 371, y, text: String(org) }, { x: 410, y, text: String(each) }, { x: 481, y, text: unit }, { x: 512, y, text: "X" }, { x: 566, y, text: extended });
    rest.forEach((more, k) => out.push({ x: 120, y: y - 11 * (k + 1), text: more }));
    y -= 11 * rest.length;
  }
  out.push({ x: 120, y: 314, text: "List of Payments" }, { x: 120, y: 291, text: "11/19/2026" }, { x: 238, y: 291, text: "12.87" }, { x: 276, y: 291, text: "Card xxxx0000 Auth 100000" });
  return [...out, ...(o.extra ?? [])];
};

const totals = (sub: string, tax: string, total: string): TextItem[] => [
  { x: 465, y: 142, text: "Sub Total" },
  { x: 551, y: 142, text: sub },
  { x: 489, y: 118, text: "Tax" },
  { x: 556, y: 118, text: tax },
  { x: 60, y: 110, text: "Any discrepancies must be reported within 5 working days." },
  { x: 484, y: 106, text: "Total" },
  { x: 551, y: 106, text: total },
  { x: 464, y: 94, text: "Payments" },
  { x: 551, y: 94, text: total },
  { x: 470, y: 82, text: "Balance" },
  { x: 557, y: 82, text: "$0.00" },
];

const SHIPPING: [string, number, number, string, string] = ['Shipping Direct-To-Client *NO PAPERWORK\nINCLUDED"', 1, 1, "5.50", "5.50"];

describe("reading a lab invoice", () => {
  const items = page({
    number: "5400001",
    reference: ["2026 Example Soccer Club"],
    items: [["School/Sports Package Unit", 2, 1, "0.82", "1.64"], ["4x5 Photo Magnet", 2, 1, "2.50", "5.00"], SHIPPING],
    extra: totals("$12.14", "$0.73", "$12.87"),
  });
  const [invoice] = parseInvoices(toLines(items));

  it("reads the numbers that tie it to an order", () => {
    expect(invoice.invoiceNumber).toBe("5400001");
    expect(invoice.invoiceDate).toBe("2026-11-19");
    expect(invoice.orders).toHaveLength(1);
    const [order] = invoice.orders;
    expect(order.labOrderNumber).toBe("2070001");
    expect(order.receivedDate).toBe("2026-11-17");
    expect(order.onlineOrderNumber).toBe("IQ80000001");
    // The PO number, not the online order number, is the Captura order.
    expect(order.capturaOrderNumber).toBe("70000001");
    expect(order.reference).toBe("2026 Example Soccer Club");
    expect(order.customerName).toBe("Pat Sample");
  });

  it("reads each item line and the totals", () => {
    expect(invoice.orders[0].items).toEqual([
      { description: "School/Sports Package Unit", orgQty: 2, eachQty: 1, unitPrice: 0.82, extended: 1.64, taxed: true, shipping: false },
      { description: "4x5 Photo Magnet", orgQty: 2, eachQty: 1, unitPrice: 2.5, extended: 5, taxed: true, shipping: false },
      { description: 'Shipping Direct-To-Client *NO PAPERWORK INCLUDED"', orgQty: 1, eachQty: 1, unitPrice: 5.5, extended: 5.5, taxed: true, shipping: true },
    ]);
    expect([invoice.subtotal, invoice.tax, invoice.total, invoice.payments, invoice.balance]).toEqual([12.14, 0.73, 12.87, 12.87, 0]);
    expect(invoice.problems).toEqual([]);
    expect(orderCosts(invoice)).toEqual([{ products: 6.64, shipping: 5.5, tax: 0.73, total: 12.87 }]);
  });

  it("never reads the ship-to address", () => {
    expect(JSON.stringify(invoice)).not.toContain("Test Lane");
  });

  it("joins a job name that wraps onto a second line", () => {
    const [wrapped] = parseInvoices(
      toLines(page({ number: "5400002", reference: ["2026 Example Rams Football and", "Cheer"], items: [["4x5 Photo Magnet", 1, 1, "2.50", "2.50"], SHIPPING], extra: totals("$8.00", "$0.48", "$8.48") })),
    );
    expect(wrapped.orders[0].reference).toBe("2026 Example Rams Football and Cheer");
    expect(wrapped.orders[0].customerName).toBe("Pat Sample");
    expect(wrapped.orders[0].items).toHaveLength(2);
    expect(wrapped.problems).toEqual([]);
  });

  it("keeps a description that ends in numbers whole", () => {
    const [one] = parseInvoices(toLines(page({ number: "5400003", reference: ["2026 Example"], items: [["8x10 Print Set of 2", 3, 2, "1.25", "7.50"]], extra: totals("$7.50", "$0.00", "$7.50") })));
    expect(one.orders[0].items[0]).toMatchObject({ description: "8x10 Print Set of 2", orgQty: 3, eachQty: 2, unitPrice: 1.25, extended: 7.5 });
  });

  it("flags an invoice that does not add up, without dropping it", () => {
    const [off] = parseInvoices(toLines(page({ number: "5400004", reference: ["2026 Example"], items: [["4x5 Photo Magnet", 1, 1, "2.50", "2.50"]], extra: totals("$9.00", "$0.50", "$9.75") })));
    expect(off.total).toBe(9.75);
    expect(off.problems).toEqual(["The item lines do not add up to the subtotal.", "Subtotal plus tax does not equal the total."]);
  });

  it("flags a page it cannot make sense of", () => {
    const [bare] = parseInvoices(["INVOICE 5400005", "Something else entirely"]);
    expect(bare.problems).toContain("No order was found.");
    expect(bare.problems).toContain("No total was found.");
    expect(parseInvoices(["A letter, not an invoice"])).toEqual([]);
  });

  it("splits a document that holds several invoices", () => {
    const a = toLines(page({ number: "5400006", reference: ["2026 Example A"], items: [["4x5 Photo Magnet", 1, 1, "2.50", "2.50"]], extra: totals("$2.50", "$0.15", "$2.65") }));
    const b = toLines(page({ number: "5400007", reference: ["2026 Example B"], items: [["4x5 Photo Magnet", 2, 1, "2.50", "5.00"]], extra: totals("$5.00", "$0.30", "$5.30") }));
    const both = parseInvoices([...a, ...b]);
    expect(both.map((i) => [i.invoiceNumber, i.orders[0].reference, i.total])).toEqual([["5400006", "2026 Example A", 2.65], ["5400007", "2026 Example B", 5.3]]);
  });

  it("reads an invoice that holds several orders across two pages", () => {
    const lines = [
      "Page 1 of 2",
      "INVOICE 5400010",
      "Bill To: Ship To:",
      "Example Photo Co 2000001 Pat Sample",
      "Client No.: 10001 Invoice Date: 11/13/2026",
      "Order Item Description Org. Each Unit Tax Extended",
      "2060031 Received: 11/11/2026 Online Order No: IQ80000011; PO No: 70000011;",
      "Reference: 2026 Example Soccer Club",
      "For: Pat Sample",
      "School/Sports Package Unit 2 1 0.82 X 1.64",
      "Shipping Direct-To-Client *NO PAPERWORK 1 1 5.50 X 5.50",
      'INCLUDED"',
      "2060039 Received: 11/11/2026 Online Order No: IQ80000012; PO No: 70000012;",
      "Reference: 2026 Example Longhorns Football &",
      "Cheer",
      "For: Sam Sample",
      "8-Wallet Prints With Die-Cut 1 1 1.90 X 1.90",
      "Shipping Direct-To-Client *NO PAPERWORK 1 1 5.50 X 5.50",
      'INCLUDED"',
      "List of Payments",
      "Page 2 of 2",
      "INVOICE 5400010",
      "Bill To: Ship To:",
      "Example Photo Co 2000001 Pat Sample",
      "1 Main Street 22 Test Lane",
      "Client No.: 10001 Invoice Date: 11/13/2026",
      "Order Item Description Org. Each Unit Tax Extended",
      "11/13/2026 15.39 Card xxxx0000 Auth 100000",
      "Sub Total $14.54",
      "Tax $0.85",
      "Total $15.39",
      "Payments $15.39",
      "Balance $0.00",
    ];
    const [invoice] = parseInvoices(lines);
    expect(invoice.problems).toEqual([]);
    expect(invoice.orders.map((o) => [o.capturaOrderNumber, o.reference, o.customerName, o.items.length])).toEqual([
      ["70000011", "2026 Example Soccer Club", "Pat Sample", 2],
      ["70000012", "2026 Example Longhorns Football & Cheer", "Sam Sample", 2],
    ]);
    expect(JSON.stringify(invoice)).not.toContain("Test Lane");
    // The tax is shared by each order's taxed lines and adds up to the invoice.
    const costs = orderCosts(invoice);
    expect(costs).toEqual([
      { products: 1.64, shipping: 5.5, tax: 0.42, total: 7.56 },
      { products: 1.9, shipping: 5.5, tax: 0.43, total: 7.83 },
    ]);
    expect(costs.reduce((n, c) => n + Math.round(c.total * 100), 0)).toBe(1539);
  });

  it("keeps a job name whole when the page breaks right after it", () => {
    const [invoice] = parseInvoices([
      "Page 1 of 2",
      "INVOICE 5400012",
      "Client No.: 10001 Ordered By: Invoice Date: 10/10/2026",
      "Order Item Description Org. Each Unit Tax Extended",
      "2060050 Received: 10/9/2026 Online Order No: IQ80000050; PO No: 70000050;",
      "Reference: 2026 Example Eagles Football and Cheer",
      "Page 2 of 2",
      "INVOICE 5400012",
      "Client No.: 10001 Ordered By: Invoice Date: 10/10/2026",
      "Order Item Description Org. Each Unit Tax Extended",
      "For: Pat Sample",
      "8-Wallet Prints With Die-Cut 1 1 1.90 X 1.90",
      "Sub Total $1.90",
      "Tax $0.11",
      "Total $2.01",
    ]);
    expect(invoice.problems).toEqual([]);
    expect(invoice.invoiceDate).toBe("2026-10-10");
    expect(invoice.orders[0].reference).toBe("2026 Example Eagles Football and Cheer");
  });

  it("reads a remake that has no customer line and costs nothing", () => {
    const [remake] = parseInvoices([
      "INVOICE 5400011",
      "Client No.: 10001 Invoice Date: 11/12/2026",
      "Order Item Description Org. Each Unit Tax Extended",
      "2063249 Received: 11/12/2026 Online Order No: IQ70000020; PO No: 60000020;",
      "Reference: 2026 Example Soccer Club",
      "School/Sports Half-Unit - Remake Full 1 1 0.00 X 0.00",
      "Shipping Direct-To-Client *NO PAPERWORK 1 1 0.00 X 0.00",
      'INCLUDED" - Remake Full',
      "Sub Total $0.00",
      "Tax $0.00",
      "Total $0.00",
    ]);
    expect(remake.problems).toEqual([]);
    expect(remake.orders[0]).toMatchObject({ capturaOrderNumber: "60000020", reference: "2026 Example Soccer Club", customerName: null });
    expect(remake.orders[0].items.map((i) => [i.description, i.shipping])).toEqual([
      ["School/Sports Half-Unit - Remake Full", false],
      ['Shipping Direct-To-Client *NO PAPERWORK INCLUDED" - Remake Full', true],
    ]);
    expect(orderCosts(remake)).toEqual([{ products: 0, shipping: 0, tax: 0, total: 0 }]);
  });

  it("files by the month of the invoice date", () => {
    expect(monthFolder("2026-11-19")).toBe("2026-11");
  });
});

describe("reading the text of a PDF", () => {
  it("turns a real PDF into the same lines", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const sheet = doc.addPage([612, 792]);
    const items = page({ number: "5400008", reference: ["2026 Example Soccer Club"], items: [["4x5 Photo Magnet", 2, 1, "2.50", "5.00"], SHIPPING], extra: totals("$10.50", "$0.63", "$11.13") });
    for (const i of items) sheet.drawText(i.text, { x: i.x, y: i.y, size: 8, font });
    const { pdfLines } = await import("@/lib/lab/pdf-text");
    const [invoice] = parseInvoices(await pdfLines(await doc.save()));
    expect(invoice).toMatchObject({ invoiceNumber: "5400008", total: 11.13, problems: [] });
    expect(invoice.orders[0]).toMatchObject({ capturaOrderNumber: "70000001", reference: "2026 Example Soccer Club" });
    expect(invoice.orders[0].items).toHaveLength(2);
  });
});
