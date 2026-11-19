// Reads a lab invoice from the text of its PDF, by rule. No network, no
// database and no model here, so every rule can be tested on its own.
//
// The layout is the one Alkit's invoice emails use: one invoice per page with
// an "INVOICE <number>" heading, an order line carrying the lab's order
// number, the date received, the "Online Order No" and the "PO No" (the PO No
// is the Captura order number), a "Reference:" line (the job's name as the lab
// has it), a "For:" line (the customer), the item lines, then the totals.
//
// The ship-to address is on the page but is never read: the record keeps the
// customer's name only.

export type TextItem = { x: number; y: number; text: string };

/** One page's text items as lines, top to bottom, each read left to right. */
export function toLines(items: TextItem[], tolerance = 3): string[] {
  const rows: { y: number; cells: TextItem[] }[] = [];
  for (const item of [...items].filter((i) => i.text.trim()).sort((a, b) => b.y - a.y)) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row.y - item.y) <= tolerance) row.cells.push(item);
    else rows.push({ y: item.y, cells: [item] });
  }
  return rows.map((r) =>
    r.cells
      .sort((a, b) => a.x - b.x)
      .map((c) => c.text.trim())
      .join(" "),
  );
}

export type InvoiceItem = {
  description: string;
  orgQty: number;
  eachQty: number;
  unitPrice: number;
  extended: number;
  taxed: boolean;
  /** Shipping and handling lines, kept apart from what was made. */
  shipping: boolean;
};

export type ParsedInvoice = {
  invoiceNumber: string;
  /** "YYYY-MM-DD" */
  invoiceDate: string | null;
  labOrderNumber: string | null;
  receivedDate: string | null;
  onlineOrderNumber: string | null;
  /** The lab's "PO No": the Captura order number. */
  capturaOrderNumber: string | null;
  reference: string | null;
  customerName: string | null;
  items: InvoiceItem[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  payments: number | null;
  balance: number | null;
  /** Plain reasons a person should look at this one. Empty when it adds up. */
  problems: string[];
};

const MONEY = String.raw`\(?-?\$?-?[\d,]*\.\d{2}\)?`;
const DATE = String.raw`\d{1,2}\/\d{1,2}\/\d{4}`;
const HEADING = /(?:^|\s)INVOICE\s+(\d{4,12})\s*$/;
const ITEM = new RegExp(String.raw`^(.*\S)\s+(\d+)\s+(\d+)\s+(${MONEY})\s+(X\s+)?(${MONEY})$`);

function money(text: string | undefined): number | null {
  if (!text) return null;
  const negative = /^\(.*\)$/.test(text.trim()) || text.includes("-");
  const n = Number(text.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

function isoDate(text: string | undefined): string | null {
  const m = text ? /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim()) : null;
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${m[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const cents = (n: number) => Math.round(n * 100);
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function labelled(lines: string[], label: RegExp): number | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = label.exec(lines[i]);
    if (m) return money(m[1]);
  }
  return null;
}

function parseOne(invoiceNumber: string, lines: string[]): ParsedInvoice {
  const all = lines.join("\n");
  const problems: string[] = [];
  const orderLines = lines.filter((l) => /^\d+\s+Received:/.test(l));
  const order = orderLines[0] ?? "";

  let reference: string | null = null;
  let customerName: string | null = null;
  const items: InvoiceItem[] = [];
  let mode: "before" | "reference" | "items" | "after" = "before";
  for (const line of lines) {
    if (/^List of Payments\b/.test(line) || /\bSub Total\b/.test(line)) {
      if (mode !== "before") mode = "after";
      continue;
    }
    if (mode === "after") continue;
    if (/^\d+\s+Received:/.test(line)) continue;
    const ref = /^Reference:\s*(.*)$/.exec(line);
    if (ref) {
      if (reference === null) reference = ref[1];
      mode = "reference";
      continue;
    }
    const who = /^For:\s*(.*)$/.exec(line);
    if (who) {
      if (customerName === null) customerName = who[1];
      mode = "items";
      continue;
    }
    if (mode === "reference") {
      // A long job name wraps onto the next line.
      reference = `${reference ?? ""} ${line}`;
      continue;
    }
    if (mode === "items") {
      const m = ITEM.exec(line);
      const unit = m ? money(m[4]) : null;
      const extended = m ? money(m[6]) : null;
      if (m && unit !== null && extended !== null) {
        const description = clean(m[1]);
        items.push({
          description,
          orgQty: Number(m[2]),
          eachQty: Number(m[3]),
          unitPrice: unit,
          extended,
          taxed: !!m[5],
          shipping: /^(shipping|postage|freight|handling)\b/i.test(description),
        });
      } else if (items.length > 0) {
        // A long description wraps onto the next line.
        const last = items[items.length - 1];
        last.description = clean(`${last.description} ${line}`);
      }
    }
  }

  const invoice: ParsedInvoice = {
    invoiceNumber,
    invoiceDate: isoDate(new RegExp(String.raw`Invoice Date:\s*(${DATE})`).exec(all)?.[1]),
    labOrderNumber: /^(\d+)\s+Received:/.exec(order)?.[1] ?? null,
    receivedDate: isoDate(new RegExp(String.raw`Received:\s*(${DATE})`).exec(order)?.[1]),
    onlineOrderNumber: /Online Order No:\s*([A-Za-z0-9-]+)/.exec(order)?.[1] ?? null,
    capturaOrderNumber: /PO No:\s*([A-Za-z0-9-]+)/.exec(order)?.[1] ?? null,
    reference: reference ? clean(reference).slice(0, 300) || null : null,
    customerName: customerName ? clean(customerName).slice(0, 200) || null : null,
    items,
    subtotal: labelled(lines, new RegExp(String.raw`\bSub Total\s+(${MONEY})`)),
    // The column heading also says "Tax", so the amount must carry its "$".
    tax: labelled(lines, /(?:^|\s)Tax\s+(\(?-?\$[\d,]*\.\d{2}\)?)/),
    total: labelled(lines, new RegExp(String.raw`(?<!Sub\s)\bTotal\s+(${MONEY})`)),
    payments: labelled(lines, new RegExp(String.raw`\bPayments\s+(${MONEY})`)),
    balance: labelled(lines, new RegExp(String.raw`\bBalance\s+(${MONEY})`)),
    problems,
  };

  if (!invoice.invoiceDate) problems.push("No invoice date was found.");
  if (orderLines.length > 1) problems.push("More than one order is on this invoice.");
  if (!invoice.capturaOrderNumber) problems.push("No PO number was found.");
  if (!invoice.reference) problems.push("No job reference was found.");
  if (items.length === 0) problems.push("No item lines were found.");
  if (invoice.total === null) problems.push("No total was found.");
  const sum = items.reduce((n, i) => n + cents(i.extended), 0);
  if (items.length > 0 && invoice.subtotal !== null && sum !== cents(invoice.subtotal)) {
    problems.push("The item lines do not add up to the subtotal.");
  }
  if (invoice.subtotal !== null && invoice.total !== null && cents(invoice.subtotal) + cents(invoice.tax ?? 0) !== cents(invoice.total)) {
    problems.push("Subtotal plus tax does not equal the total.");
  }
  return invoice;
}

/**
 * Every invoice in a document's lines. A new invoice starts at each
 * "INVOICE <number>" heading; a heading that repeats the number in hand is a
 * second page of the same invoice.
 */
export function parseInvoices(lines: string[]): ParsedInvoice[] {
  const chunks: { number: string; lines: string[] }[] = [];
  for (const raw of lines) {
    const line = clean(raw);
    if (!line) continue;
    const heading = HEADING.exec(line);
    if (heading && chunks[chunks.length - 1]?.number !== heading[1]) {
      chunks.push({ number: heading[1], lines: [] });
      continue;
    }
    if (heading) continue;
    chunks[chunks.length - 1]?.lines.push(line);
  }
  return chunks.map((c) => parseOne(c.number, c.lines));
}

/** What was made and what it cost to ship, from the item lines. */
export function invoiceSplit(invoice: ParsedInvoice): { products: number; shipping: number } {
  const of = (shipping: boolean) => invoice.items.filter((i) => i.shipping === shipping).reduce((n, i) => n + cents(i.extended), 0) / 100;
  return { products: of(false), shipping: of(true) };
}

/** The month folder an invoice is filed in, such as "2026-11". */
export function monthFolder(isoDay: string): string {
  return isoDay.slice(0, 7);
}
