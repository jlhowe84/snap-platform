import "server-only";

import { getDocumentProxy } from "unpdf";
import { toLines, type TextItem } from "./invoice-parse";

// The text of a PDF as lines, page after page. Invoices from the lab are
// made by a report tool and carry real text, so nothing is recognised from
// an image and no model is involved.

const MAX_PAGES = 40;

export async function pdfLines(bytes: Uint8Array): Promise<string[]> {
  // pdf.js takes the buffer over, so it gets its own copy.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const lines: string[] = [];
  try {
    for (let n = 1; n <= Math.min(pdf.numPages, MAX_PAGES); n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const items: TextItem[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        items.push({ x: item.transform[4], y: item.transform[5], text: item.str });
      }
      lines.push(...toLines(items));
    }
  } finally {
    await pdf.cleanup?.();
  }
  return lines;
}
