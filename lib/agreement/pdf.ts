import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type AgreementSection = {
  key: string;
  title: string;
  body: string;
  initial?: boolean;
};

export type SignedAgreement = {
  companyName: string;
  jobName: string;
  photoDays: string[];
  version: number;
  title: string;
  sections: AgreementSection[];
  signerName: string;
  signerEmail: string;
  initials: Record<string, string>;
  signedAt: string; // ISO timestamp
  ipAddress: string | null;
  signatureId: string;
};

// The standard PDF fonts only cover WinAnsi. Map the usual typographic
// characters and replace anything else, so a pasted symbol never breaks a PDF.
const REPLACE: Record<string, string> = {
  "‘": "'", "’": "'", "“": '"', "”": '"',
  "–": "-", "—": "-", "…": "...", " ": " ", "•": "-",
};
export function pdfSafe(text: string) {
  return text
    .replace(/[‘’“”–—… •]/g, (c) => REPLACE[c] ?? c)
    .replace(/[^\x09\x0A\x0D\x20-\x7E¡-ÿ]/g, "?");
}

export function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of pdfSafe(text).split(/\r?\n/)) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

const PAGE = { width: 612, height: 792, margin: 56 }; // US Letter

export async function buildAgreementPdf(a: SignedAgreement): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`${a.title} - ${a.jobName}`));
  doc.setAuthor(pdfSafe(a.companyName));
  doc.setCreationDate(new Date(a.signedAt));

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const width = PAGE.width - PAGE.margin * 2;

  let page: PDFPage = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - PAGE.margin;

  const ensure = (needed: number) => {
    if (y - needed < PAGE.margin) {
      page = doc.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - PAGE.margin;
    }
  };
  const write = (text: string, opts: { font?: PDFFont; size?: number; gap?: number; color?: [number, number, number] } = {}) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? 10;
    const lead = size * 1.4;
    for (const line of wrapText(text, font, size, width)) {
      ensure(lead);
      if (line) page.drawText(line, { x: PAGE.margin, y: y - size, size, font, color: rgb(...(opts.color ?? [0.1, 0.1, 0.1])) });
      y -= lead;
    }
    y -= opts.gap ?? 0;
  };

  write(a.companyName, { font: bold, size: 11, color: [0.85, 0.4, 0.1] });
  write(a.title, { font: bold, size: 18, gap: 4 });
  write(`${a.jobName}`, { size: 11 });
  if (a.photoDays.length) write(`Photo day${a.photoDays.length > 1 ? "s" : ""}: ${a.photoDays.join("; ")}`, { size: 11 });
  write(`Agreement version ${a.version}`, { size: 9, gap: 12, color: [0.4, 0.4, 0.4] });

  for (const s of a.sections) {
    ensure(40);
    write(s.title, { font: bold, size: 12, gap: 2 });
    write(s.body, { gap: 4 });
    if (s.initial) {
      write(`Initialed: ${a.initials[s.key] ?? "(missing)"}`, { font: bold, size: 10, gap: 10 });
    } else {
      y -= 8;
    }
  }

  ensure(120);
  y -= 8;
  page.drawLine({ start: { x: PAGE.margin, y }, end: { x: PAGE.width - PAGE.margin, y }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
  y -= 14;
  write("Signed electronically", { font: bold, size: 12, gap: 2 });
  write(`Name: ${a.signerName}`);
  write(`Email: ${a.signerEmail}`);
  write(`Signed at: ${new Date(a.signedAt).toISOString().replace("T", " ").slice(0, 19)} UTC`);
  if (a.ipAddress) write(`From IP address: ${a.ipAddress}`);
  write(`Signature record: ${a.signatureId}`, { size: 8, color: [0.4, 0.4, 0.4] });

  return doc.save();
}
