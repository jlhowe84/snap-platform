import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const { createDriveClient, driveProblem, DriveError, folderIdFrom, serviceAssertion, DRIVE_SCOPE } = await import("@/lib/drive/client");
const { fileNameFor, invoiceQuery, invoiceRow, labSettings, pdfParts } = await import("@/lib/lab/sync");
const { costView, searchTerm } = await import("@/lib/lab/costs");
const { orderGalleryId } = await import("@/lib/captura/shape");

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const sa = {
  client_email: "svc@example.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  token_uri: "https://oauth2.googleapis.com/token",
};
const ROOT = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";

function fakeDrive(answers: (url: string, init?: RequestInit) => unknown) {
  const calls: { url: string; method: string; body?: unknown }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === sa.token_uri) return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }));
    calls.push({ url, method: init?.method ?? "GET", body: init?.body });
    const out = answers(url, init);
    return out instanceof Response ? out : new Response(JSON.stringify(out));
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("drive client", () => {
  it("signs in as the service account itself, for Drive only", () => {
    const claims = JSON.parse(Buffer.from(serviceAssertion(sa, 1000).split(".")[1], "base64url").toString());
    expect(claims).toEqual({ iss: sa.client_email, scope: DRIVE_SCOPE, aud: sa.token_uri, iat: 1000, exp: 4600 });
    expect(claims.sub).toBeUndefined();
  });

  it("reads a folder id from a pasted link or a bare id", () => {
    expect(folderIdFrom(`https://drive.google.com/drive/folders/${ROOT}?usp=drive_link`)).toBe(ROOT);
    expect(folderIdFrom(`https://drive.google.com/drive/u/0/folders/${ROOT}`)).toBe(ROOT);
    expect(folderIdFrom(` ${ROOT} `)).toBe(ROOT);
    expect(folderIdFrom("not a folder")).toBeNull();
  });

  it("finds a month folder, or makes it once, inside the shared folder", async () => {
    const { calls, fetchImpl } = fakeDrive((url, init) => (init?.method === "POST" ? { id: "month-id-0000000001" } : url.includes("?q=") ? { files: [] } : {}));
    const drive = createDriveClient(sa, ROOT, fetchImpl);
    const [a, b] = await Promise.all([drive.monthFolder("2026-11"), drive.monthFolder("2026-11")]);
    expect([a, b]).toEqual(["month-id-0000000001", "month-id-0000000001"]);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(JSON.parse(String(calls.find((c) => c.method === "POST")!.body))).toMatchObject({ name: "2026-11", parents: [ROOT] });
    expect(decodeURIComponent(calls[0].url)).toContain(`'${ROOT}' in parents and name = '2026-11'`);
    await expect(drive.monthFolder("../elsewhere")).rejects.toThrow(/2026-11/);
  });

  it("adds a PDF only to a folder it found", async () => {
    const { calls, fetchImpl } = fakeDrive((url, init) => (init?.method === "POST" ? { id: "file-id-00000000001" } : { files: [{ id: "month-id-0000000001", name: "2026-11" }] }));
    const drive = createDriveClient(sa, ROOT, fetchImpl);
    await expect(drive.uploadPdf("some-other-folder-id", "a.pdf", new Uint8Array([1]))).rejects.toThrow(/outside/);
    const folder = await drive.monthFolder("2026-11");
    expect(await drive.uploadPdf(folder, "Invoice 1.pdf", new Uint8Array([37, 80, 68, 70]))).toBe("file-id-00000000001");
    const upload = calls.find((c) => c.url.includes("/upload/"))!;
    expect(upload.url).toContain("uploadType=multipart");
    expect(Buffer.from(upload.body as Uint8Array).toString()).toContain('"parents":["month-id-0000000001"]');
  });

  it("explains a refusal in plain words", async () => {
    const { fetchImpl } = fakeDrive(() => new Response(JSON.stringify({ error: { errors: [{ reason: "notFound" }] } }), { status: 404 }));
    const error = await createDriveClient(sa, ROOT, fetchImpl).root().catch((e) => e);
    expect(error).toBeInstanceOf(DriveError);
    expect(driveProblem(error)).toMatch(/Share it with the platform/);
    expect(driveProblem(new DriveError(403, "accessNotConfigured"))).toMatch(/Drive API is not turned on/);
    expect(driveProblem(new DriveError(403, "insufficientFilePermissions"))).toMatch(/Content manager/);
  });
});

describe("invoice pickup", () => {
  it("reads who sends invoices from settings and drops bad rows", () => {
    const s = labSettings([
      { key: "lab.invoice_sources", value: [{ lab: "Lab", from: " Rep@Lab.invalid ", subject: 'Lab "Invoice"' }, { lab: "Lab", from: "nobody", subject: "x" }, { from: "a@b.invalid", subject: "Invoice" }] },
      { key: "lab.invoice_drive_folder", value: `https://drive.google.com/drive/folders/${ROOT}` },
      { key: "lab.invoice_first_sync_days", value: 30 },
    ]);
    expect(s.sources).toEqual([{ lab: "Lab", from: "rep@lab.invalid", subject: "Lab  Invoice" }]);
    expect(s.folderId).toBe(ROOT);
    expect(s.firstDays).toBe(30);
    expect(s.enabled).toBe(false);
    expect(labSettings([]).folderId).toBeNull();
  });

  it("searches one sender and subject in one stretch of time", () => {
    expect(invoiceQuery({ lab: "Lab", from: "rep@lab.invalid", subject: "Lab Invoice" }, { from: 1000_000, to: 2000_500 })).toBe(
      'from:rep@lab.invalid subject:"Lab Invoice" has:attachment after:1000 before:2002',
    );
  });

  it("finds PDF attachments wherever they sit", () => {
    const parts = pdfParts({
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "text/plain", body: { data: "aGk" } },
        { mimeType: "application/octet-stream", filename: "InvoiceEmail_1.PDF", body: { attachmentId: "att-1", size: 900 } },
        { mimeType: "multipart/related", parts: [{ mimeType: "application/pdf", filename: "", body: { attachmentId: "att-2" } }, { mimeType: "image/png", filename: "logo.png", body: { attachmentId: "att-3" } }] },
      ],
    });
    expect(parts).toEqual([{ filename: "InvoiceEmail_1.PDF", attachmentId: "att-1", size: 900 }, { filename: "", attachmentId: "att-2", size: 0 }]);
  });

  it("files under a safe name", () => {
    expect(fileNameFor("InvoiceEmail_5400001.pdf", "5400001")).toBe("InvoiceEmail_5400001.pdf");
    expect(fileNameFor("a/b\\c:d.pdf", "1")).toBe("a b c d.pdf");
    expect(fileNameFor("", "5400001")).toBe("Invoice 5400001.pdf");
    expect(fileNameFor("scan.exe", "5400001")).toBe("Invoice 5400001.pdf");
  });

  it("shapes an invoice for storing, flagging one that needs a look", () => {
    const row = invoiceRow(
      {
        invoiceNumber: "5400001", invoiceDate: null, labOrderNumber: "2070001", receivedDate: "2026-11-17", onlineOrderNumber: "IQ1", capturaOrderNumber: "70000001",
        reference: "2026 Example", customerName: "Pat Sample", subtotal: 2.5, tax: 0.15, total: 2.65, payments: 2.65, balance: 0,
        items: [{ description: "Magnet", orgQty: 1, eachQty: 1, unitPrice: 2.5, extended: 2.5, taxed: true, shipping: false }],
        problems: ["No invoice date was found."],
      },
      { lab: "Lab", mailbox: "help@test.invalid", messageId: "m1", fileName: "a.pdf", driveFileId: "f1", driveFolder: "2026-11", fallbackDate: "2026-11-19" },
    );
    expect(row).toMatchObject({ lab: "Lab", invoice_number: "5400001", invoice_date: "2026-11-19", needs_check: true, check_note: "No invoice date was found.", drive_file_id: "f1", captura_order_number: "70000001" });
    expect(row.items).toEqual([{ description: "Magnet", org_qty: 1, each_qty: 1, unit_price: 2.5, extended: 2.5, taxed: true, shipping: false }]);
  });

  it("reads the gallery from a Captura order only when there is exactly one", () => {
    expect(orderGalleryId({ orders: [{ galleryOrders: [{ galleryID: 123456 }] }] })).toBe("123456");
    expect(orderGalleryId({ galleryOrders: [{ galleryID: "123456" }, { galleryID: 123456 }] })).toBe("123456");
    expect(orderGalleryId({ orders: [{ galleryOrders: [{ galleryID: 1 }, { galleryID: 2 }] }] })).toBeNull();
    expect(orderGalleryId({})).toBeNull();
  });
});

describe("lab costs", () => {
  const row = (o: Partial<Parameters<typeof costView>[0][number]>) => ({ reference: "2026 A", job_id: null, job_name: null, season: "Fall 2026", year: 2026, invoices: 1, products: 0, shipping: 0, tax: 0, total: 0, needs_check: 0, ...o });
  const rows = [
    row({ job_id: "j1", job_name: "League A Fall", invoices: 3, products: 0.1, shipping: 0.2, tax: 0.03, total: 0.33 }),
    row({ job_id: "j1", job_name: "League A Fall", year: 2027, invoices: 1, products: 10, shipping: 5.5, tax: 0.93, total: 16.43 }),
    row({ reference: "2026 B", season: "Spring 2026", invoices: 2, products: 20, shipping: 11, tax: 1.86, total: 32.86, needs_check: 1 }),
  ];

  it("adds up by year, season and job", () => {
    const v = costView(rows, null);
    expect(v.all).toEqual({ invoices: 6, products: 30.1, shipping: 16.7, tax: 2.82, total: 49.62, needsCheck: 1 });
    expect(v.years.map((y) => [y.year, y.total])).toEqual([[2027, 16.43], [2026, 33.19]]);
    expect(v.seasons.map((s) => [s.season, s.total])).toEqual([["Fall 2026", 16.76], ["Spring 2026", 32.86]]);
    expect(v.jobs.map((j) => [j.reference, j.jobId, j.invoices, j.total])).toEqual([["2026 B", null, 2, 32.86], ["2026 A", "j1", 4, 16.76]]);
  });

  it("narrows to one year by invoice date, keeping every year in the list", () => {
    const v = costView(rows, 2027);
    expect(v.all.total).toBe(16.43);
    expect(v.jobs).toHaveLength(1);
    expect(v.years).toHaveLength(2);
  });

  it("makes a search safe to filter with", () => {
    expect(searchTerm(' O\'Brien, "x" (1) % ')).toBe("O'Brien x 1");
    expect(searchTerm(undefined)).toBe("");
  });
});
