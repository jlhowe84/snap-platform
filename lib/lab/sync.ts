import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { allowedMailboxes, createGmailClient, loadServiceAccount, type GmailPart } from "@/lib/gmail/client";
import { createDriveClient, driveProblem, folderIdFrom, type DriveClient } from "@/lib/drive/client";
import { createCapturaClient, loadCapturaCredentials } from "@/lib/captura/client";
import { orderMoney } from "@/lib/captura/shape";
import { syncWindows } from "@/lib/support/sync";
import { monthFolder, orderCosts, parseInvoices, type ParsedInvoice } from "./invoice-parse";
import { pdfLines } from "./pdf-text";

// Picks up the lab's invoice emails. A server job, so it uses the service
// role. For each invoice email in an allowed mailbox it reads the attached
// PDF by rule (no model), files the PDF in the company's Drive folder under
// the invoice's month, and stores the invoice. Then it ties new invoices to
// jobs through the Captura order the lab prints as its PO number.
//
// It only reads Gmail (nothing is sent, labelled or moved), only adds to the
// one shared Drive folder, and only reads Captura. Running it twice is
// harmless: an invoice number is stored once and a file name is filed once.
//
// Each order on an invoice is then looked up in Captura by its PO number, a
// few dozen a run, for its gallery (which ties it to a job) and its money
// (what the customer paid, Captura's fees and the net pay).

export type LabSyncResult = {
  company: string;
  mailbox: string;
  found: number;
  stored: number;
  unread: number;
  matched: number;
  partial: boolean;
  error: string | null;
};

const AT_ONCE = 4;
const BUDGET_MS = 40_000;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const DEFAULT_FIRST_DAYS = 7;
const ORDER_LOOKUPS = 40;
const LOOKUPS_AT_ONCE = 5;
const RECHECK_MS = 7 * 24 * 60 * 60 * 1000;

type Setting = { key: string; value: unknown };
export type InvoiceSource = { lab: string; from: string; subject: string };

export const LAB_SETTING_KEYS = ["mail.mailboxes", "lab.invoices_enabled", "lab.invoice_sources", "lab.invoice_drive_folder", "lab.invoice_first_sync_days"];

export function labSettings(rows: Setting[]) {
  const get = (key: string) => rows.find((r) => r.key === key)?.value;
  const sources = get("lab.invoice_sources");
  const folder = get("lab.invoice_drive_folder");
  const days = get("lab.invoice_first_sync_days");
  return {
    enabled: get("lab.invoices_enabled") === true,
    folderId: typeof folder === "string" ? folderIdFrom(folder) : null,
    firstDays: typeof days === "number" && days >= 1 && days <= 400 ? Math.floor(days) : DEFAULT_FIRST_DAYS,
    // Who sends the invoices, and the words their subject always holds.
    sources: Array.isArray(sources)
      ? sources
          .filter((x): x is InvoiceSource => {
            const s = x as Partial<InvoiceSource> | null;
            return !!s && typeof s.lab === "string" && !!s.lab.trim() && typeof s.from === "string" && /^[^\s"@]+@[^\s"@]+$/.test(s.from.trim()) &&
              typeof s.subject === "string" && s.subject.trim().length >= 3;
          })
          .map((s) => ({ lab: s.lab.trim().slice(0, 60), from: s.from.trim().toLowerCase(), subject: s.subject.replace(/["\\]/g, " ").trim() }))
      : [],
  };
}

/** The Gmail search for one sender's invoice emails in one stretch of time. */
export function invoiceQuery(source: InvoiceSource, w: { from: number; to: number }): string {
  return `from:${source.from} subject:"${source.subject}" has:attachment after:${Math.floor(w.from / 1000)} before:${Math.ceil(w.to / 1000) + 1}`;
}

/** The PDF attachments of a message, wherever they sit in its parts. */
export function pdfParts(part: GmailPart | undefined): { filename: string; attachmentId: string; size: number }[] {
  if (!part) return [];
  const here =
    part.body?.attachmentId && (part.mimeType === "application/pdf" || /\.pdf$/i.test(part.filename ?? ""))
      ? [{ filename: part.filename ?? "", attachmentId: part.body.attachmentId, size: part.body.size ?? 0 }]
      : [];
  return [...here, ...(part.parts ?? []).flatMap(pdfParts)];
}

/** A file name safe to file under, ending in .pdf. */
export function fileNameFor(filename: string, invoiceNumber: string): string {
  const base = filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!base || !/\.pdf$/i.test(base)) return `Invoice ${invoiceNumber}.pdf`;
  return base;
}

/** One parsed invoice as public.lab_invoice_store takes it. */
export function invoiceRow(
  invoice: ParsedInvoice,
  where: { lab: string; mailbox: string; messageId: string; fileName: string; driveFileId: string; driveFolder: string; fallbackDate: string },
) {
  const costs = orderCosts(invoice);
  return {
    lab: where.lab,
    invoice_number: invoice.invoiceNumber,
    invoice_date: invoice.invoiceDate ?? where.fallbackDate,
    subtotal: invoice.subtotal,
    tax: invoice.tax,
    total: invoice.total,
    payments: invoice.payments,
    balance: invoice.balance,
    needs_check: invoice.problems.length > 0,
    check_note: invoice.problems.join(" ") || null,
    mailbox: where.mailbox,
    gmail_message_id: where.messageId,
    file_name: where.fileName,
    drive_file_id: where.driveFileId,
    drive_folder: where.driveFolder,
    orders: invoice.orders.map((o, k) => ({
      lab_order_number: o.labOrderNumber,
      received_date: o.receivedDate,
      online_order_number: o.onlineOrderNumber,
      captura_order_number: o.capturaOrderNumber,
      reference: o.reference,
      customer_name: o.customerName,
      ...costs[k],
      items: o.items.map((i) => ({
        description: i.description,
        org_qty: i.orgQty,
        each_qty: i.eachQty,
        unit_price: i.unitPrice,
        extended: i.extended,
        taxed: i.taxed,
        shipping: i.shipping,
      })),
    })),
  };
}

type Admin = ReturnType<typeof createAdminClient>;

async function knownMessages(admin: Admin, companyId: string, ids: string[]): Promise<Set<string>> {
  const known = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const slice = ids.slice(i, i + 200);
    const [{ data: stored }, { data: skipped }] = await Promise.all([
      admin.from("lab_invoices").select("gmail_message_id").eq("company_id", companyId).in("gmail_message_id", slice),
      admin.from("lab_invoice_skips").select("gmail_message_id").eq("company_id", companyId).in("gmail_message_id", slice),
    ]);
    for (const r of [...(stored ?? []), ...(skipped ?? [])]) if (r.gmail_message_id) known.add(r.gmail_message_id);
  }
  return known;
}

/**
 * Reads each new order's Captura order (by the PO number the lab printed),
 * a few dozen a run, for its gallery and its money, then ties orders to jobs.
 * An order Captura does not know is tried again after a week.
 */
async function enrichOrders(admin: Admin, companyId: string, deadline: number): Promise<number> {
  const link = async () => Number((await admin.rpc("lab_invoices_link", { p_company: companyId })).data ?? 0);
  if (Date.now() > deadline) return link();

  const stale = new Date(Date.now() - RECHECK_MS).toISOString();
  const { data: open } = await admin
    .from("lab_invoice_orders")
    .select("id, captura_order_number")
    .eq("company_id", companyId)
    .not("captura_order_number", "is", null)
    .or(`captura_checked_at.is.null,and(captura_found.eq.false,captura_checked_at.lt.${stale})`)
    .order("captura_checked_at", { ascending: true, nullsFirst: true })
    .limit(ORDER_LOOKUPS);
  const todo = (open ?? []).filter((o) => o.captura_order_number && /^\d{4,14}$/.test(o.captura_order_number));
  if (todo.length === 0) return link();

  let captura: ReturnType<typeof createCapturaClient> | null = null;
  try {
    const creds = await loadCapturaCredentials(companyId);
    if (creds) captura = createCapturaClient(creds);
  } catch {
    captura = null;
  }
  if (!captura) return link();

  // One lookup per Captura order, even when the lab invoiced it twice.
  const byOrder = new Map<string, string[]>();
  for (const o of todo) byOrder.set(o.captura_order_number!, [...(byOrder.get(o.captura_order_number!) ?? []), o.id]);
  const numbers = [...byOrder.keys()];
  for (let i = 0; i < numbers.length && Date.now() < deadline; i += LOOKUPS_AT_ONCE) {
    await Promise.all(
      numbers.slice(i, i + LOOKUPS_AT_ONCE).map(async (number) => {
        let money: ReturnType<typeof orderMoney> = null;
        let answered = true;
        try {
          money = orderMoney(await captura.getOrder(number), number);
        } catch (e) {
          // A missing order is recorded; any other failure is tried next run.
          answered = e instanceof Error && /\((400|404)\)$/.test(e.message);
        }
        if (!answered) return;
        const now = new Date().toISOString();
        await admin
          .from("lab_invoice_orders")
          .update(
            money
              ? {
                  captura_checked_at: now,
                  captura_found: true,
                  ...(money.gallery_id ? { captura_gallery_id: Number(money.gallery_id) } : {}),
                  order_total: money.total,
                  order_tax: money.tax,
                  order_shipping: money.shipping,
                  order_refunded: money.refunded,
                  order_fees: money.fees,
                  order_lab_fees: money.lab_fees,
                  order_net_pay: money.net_pay,
                  order_pay_date: money.pay_date,
                  order_payment_status: money.payment_status,
                }
              : { captura_checked_at: now, captura_found: false },
          )
          .in("id", byOrder.get(number)!);
      }),
    );
  }
  return link();
}

/**
 * The scheduled run only touches companies whose lab.invoices_enabled
 * setting is true. A person in the office can run their own company by hand.
 */
export async function runLabInvoiceSync(onlyCompanyId?: string): Promise<LabSyncResult[]> {
  const admin = createAdminClient();
  let q = admin.from("companies").select("id");
  if (onlyCompanyId) q = q.eq("id", onlyCompanyId);
  const { data: companies, error } = await q;
  if (error) throw new Error(`Could not list companies: ${error.message}`);

  const results: LabSyncResult[] = [];
  for (const company of companies ?? []) {
    const { data: rows } = await admin.from("settings").select("key, value").eq("company_id", company.id).in("key", LAB_SETTING_KEYS);
    const settings = labSettings(rows ?? []);
    if (!onlyCompanyId && !settings.enabled) continue;
    const boxes = allowedMailboxes(rows ?? []);
    if (boxes.length === 0 || settings.sources.length === 0) continue;

    const started = Date.now();
    const deadline = started + BUDGET_MS;
    let setupError: string | null = null;
    let sa: Awaited<ReturnType<typeof loadServiceAccount>> = null;
    let drive: DriveClient | null = null;
    try {
      sa = await loadServiceAccount(company.id);
      if (!sa) setupError = "No Workspace key is stored.";
      else if (!settings.folderId) setupError = "No Drive folder is set for invoices yet.";
      else {
        drive = createDriveClient(sa, settings.folderId);
        const root = await drive.root();
        if (root.capabilities?.canAddChildren === false) setupError = "The platform can see the folder but may not add files. Share it as Content manager.";
      }
    } catch (e) {
      setupError = driveProblem(e);
    }

    for (const mailbox of boxes) {
      const result: LabSyncResult = { company: company.id, mailbox, found: 0, stored: 0, unread: 0, matched: 0, partial: false, error: setupError };
      results.push(result);
      if (!sa || !drive || setupError) {
        await admin.from("lab_invoice_sync_state").upsert({ company_id: company.id, mailbox, last_run_at: new Date().toISOString(), last_error: setupError });
        continue;
      }
      const files = drive;

      try {
        const { data: state } = await admin.from("lab_invoice_sync_state").select("last_synced_at").eq("company_id", company.id).eq("mailbox", mailbox).maybeSingle();
        const gmail = createGmailClient(sa, mailbox, boxes);
        const skip = (messageId: string, fileName: string, reason: string) =>
          admin.from("lab_invoice_skips").upsert({ company_id: company.id, gmail_message_id: messageId, file_name: fileName, mailbox, reason });

        windows: for (const window of syncWindows(state?.last_synced_at ?? null, settings.firstDays, started)) {
          const labOf = new Map<string, string>();
          for (const source of settings.sources) {
            let page: string | undefined;
            do {
              const list = await gmail.listMessages(invoiceQuery(source, window), page);
              for (const m of list.messages ?? []) labOf.set(m.id, source.lab);
              page = list.nextPageToken;
            } while (page);
          }
          const known = await knownMessages(admin, company.id, [...labOf.keys()]);
          const todo = [...labOf.keys()].filter((id) => !known.has(id));
          result.found += todo.length;

          for (let i = 0; i < todo.length; i += AT_ONCE) {
            if (Date.now() > deadline) {
              result.partial = true;
              break windows;
            }
            await Promise.all(
              todo.slice(i, i + AT_ONCE).map(async (messageId) => {
                const lab = labOf.get(messageId)!;
                const message = await gmail.getMessage(messageId);
                const pdfs = pdfParts(message.payload);
                if (pdfs.length === 0) {
                  result.unread += 1;
                  await skip(messageId, "", "No PDF was attached.");
                  return;
                }
                const sent = Number(message.internalDate);
                const fallbackDate = new Date(Number.isFinite(sent) && sent > 0 ? sent : Date.now()).toISOString().slice(0, 10);
                for (const pdf of pdfs) {
                  if (pdf.size > MAX_PDF_BYTES) {
                    result.unread += 1;
                    await skip(messageId, pdf.filename.slice(0, 200), "The PDF is too large to read.");
                    continue;
                  }
                  const bytes = await gmail.getAttachment(messageId, pdf.attachmentId);
                  let invoices: ParsedInvoice[] = [];
                  try {
                    invoices = parseInvoices(await pdfLines(bytes));
                  } catch {
                    invoices = [];
                  }
                  if (invoices.length === 0) {
                    result.unread += 1;
                    await skip(messageId, pdf.filename.slice(0, 200), "No invoice could be read from the PDF.");
                    continue;
                  }
                  const { data: have } = await admin
                    .from("lab_invoices")
                    .select("invoice_number")
                    .eq("company_id", company.id)
                    .eq("lab", lab)
                    .in("invoice_number", invoices.map((v) => v.invoiceNumber));
                  const stored = new Set((have ?? []).map((h) => h.invoice_number));
                  const fresh = invoices.filter((v) => !stored.has(v.invoiceNumber));
                  if (fresh.length === 0) {
                    await skip(messageId, pdf.filename.slice(0, 200), "These invoices were already stored from another email.");
                    continue;
                  }
                  const folder = monthFolder(fresh[0].invoiceDate ?? fallbackDate);
                  const folderId = await files.monthFolder(folder);
                  const fileName = fileNameFor(pdf.filename, fresh[0].invoiceNumber);
                  const fileId = (await files.findFile(folderId, fileName))?.id ?? (await files.uploadPdf(folderId, fileName, bytes));
                  for (const invoice of fresh) {
                    const { data: made, error: storeError } = await admin.rpc("lab_invoice_store", {
                      p_company: company.id,
                      p_invoice: invoiceRow(invoice, { lab, mailbox, messageId, fileName, driveFileId: fileId, driveFolder: folder, fallbackDate }),
                    });
                    if (storeError) throw new Error(`Could not store an invoice (${storeError.code ?? "error"})`);
                    if (made) result.stored += 1;
                  }
                }
              }),
            );
          }
          await admin.from("lab_invoice_sync_state").upsert({ company_id: company.id, mailbox, last_synced_at: new Date(window.to).toISOString() });
        }
      } catch (e) {
        // Errors from Gmail, Drive and the database carry no invoice content.
        result.error = e instanceof Error && !/Drive request failed/.test(e.message) ? e.message.slice(0, 300) : driveProblem(e);
      }
      await admin.from("lab_invoice_sync_state").upsert({ company_id: company.id, mailbox, last_run_at: new Date().toISOString(), last_error: result.error });
    }

    try {
      const matched = await enrichOrders(admin, company.id, deadline + 10_000);
      const first = results.find((r) => r.company === company.id);
      if (first) first.matched = matched;
    } catch {
      // Matching is tried again on the next run.
    }
  }
  return results;
}
