// A small, safe reading of the Markdown that knowledge base articles use:
// paragraphs, bullet and numbered lists, quotes, simple tables, bold, italics
// and links. It returns plain data; the page turns it into elements, so no
// HTML from an article ever reaches the page as HTML.

export type Inline = { text: string; bold?: boolean; italic?: boolean; href?: string };
export type Block =
  | { kind: "p"; parts: Inline[] }
  | { kind: "quote"; parts: Inline[][] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "table"; rows: Inline[][][] };

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

/** Bold, italics, [text](url) links and bare web addresses. */
export function inline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s)]+[^\s).,;:!?])/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ text: m[1], bold: true });
    else if (m[2] !== undefined || m[3] !== undefined) out.push({ text: (m[2] ?? m[3])!, italic: true });
    else if (m[4] !== undefined) out.push(SAFE_URL.test(m[5]) ? { text: m[4], href: m[5] } : { text: m[4] });
    else if (m[6] !== undefined) out.push({ text: m[6], href: m[6] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function toBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", parts: inline(para.join(" ")) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || /^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flush();
      continue;
    }
    if (/^\s*>/.test(line)) {
      flush();
      const quote: Inline[][] = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) quote.push(inline(lines[i].replace(/^\s*>\s?/, "")));
      i--;
      blocks.push({ kind: "quote", parts: quote });
      continue;
    }
    const bullet = /^\s*([-*+]|\d+[.)])\s+/.exec(line);
    if (bullet) {
      flush();
      const ordered = /\d/.test(bullet[1]);
      const items: Inline[][] = [];
      for (; i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i]); i++) items.push(inline(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, "")));
      i--;
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    if (/^\s*\|/.test(line)) {
      flush();
      const rows: Inline[][][] = [];
      for (; i < lines.length && /^\s*\|/.test(lines[i]); i++) {
        const row = cells(lines[i]);
        if (row.every((c) => /^:?-{2,}:?$/.test(c) || c === "")) continue;
        rows.push(row.map(inline));
      }
      i--;
      if (rows.length) blocks.push({ kind: "table", rows });
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return blocks;
}
