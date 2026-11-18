import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildAgreementPdf, pdfSafe } from "@/lib/agreement/pdf";
import { formatSections, parseSections } from "@/lib/agreement/sections";

describe("agreement sections", () => {
  it("parses headings, initials and bodies", () => {
    const s = parseSections("## Session fee [initial]\nThe league pays.\n\nSecond line.\n## Weather\nWe reschedule.");
    expect(s).toEqual([
      { key: "session_fee", title: "Session fee", body: "The league pays.\n\nSecond line.", initial: true },
      { key: "weather", title: "Weather", body: "We reschedule.", initial: false },
    ]);
  });

  it("round-trips through the editor text", () => {
    const s = parseSections("## A [initial]\none\n\n## B\ntwo");
    expect(parseSections(formatSections(s))).toEqual(s);
  });

  it("keeps keys unique and keeps text before the first heading", () => {
    const s = parseSections("Intro text\n## Fees\na\n## Fees\nb");
    expect(s.map((x) => x.key)).toEqual(["introduction", "fees", "fees_2"]);
  });
});

describe("agreement PDF", () => {
  it("makes a PDF with the signature block, even with characters the font lacks", async () => {
    const bytes = await buildAgreementPdf({
      companyName: "Test Co",
      jobName: "Test League Spring",
      photoDays: ["Sat, Apr 17, 2027"],
      version: 1,
      title: "Photo Day Agreement",
      sections: [
        { key: "fees", title: "Fees", body: "Fees are “due” — on time. ✓ ".repeat(80), initial: true },
        { key: "weather", title: "Weather", body: "Rain plan.", initial: false },
      ],
      signerName: "Pat Coordinator",
      signerEmail: "pat@test.invalid",
      initials: { fees: "PC" },
      signedAt: "2026-11-18T17:00:00Z",
      ipAddress: "203.0.113.9",
      signatureId: "61000000-0000-0000-0000-0000000000a1",
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toBe("Photo Day Agreement - Test League Spring");
  });

  it("maps typographic characters and replaces the rest", () => {
    expect(pdfSafe("“a” – b … ✓")).toBe('"a" - b ... ?');
  });
});
