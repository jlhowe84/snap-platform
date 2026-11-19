import { describe, expect, it } from "vitest";
import { parseKnowledgeMarkdown } from "@/lib/kb/import";

const doc = `---
title: Example
---

# Example Studio Knowledge Base

Version notes that are not an article.

---

## 1. Company facts

| | |
|---|---|
| **Phone** | 555-0100 |

---

## 3. Photo Day

### What if it rains?

We reschedule. *Keywords: rain*

### What should my child wear?

Full uniform.

---

## 10. Reply templates

Warm and brief.

**Gallery link**
> Hi [FIRST], here is the link: [GALLERY LINK]

**Needs info**
> Hi [FIRST], which league?

## 11. Maintenance

- Keep it curated.
`;

describe("knowledge base import", () => {
  it("makes one article per question, template and plain section", () => {
    const articles = parseKnowledgeMarkdown(doc, { skipSections: ["Maintenance"] });
    expect(articles.map((a) => [a.shelf, a.section, a.title])).toEqual([
      ["support", "Company facts", "Company facts"],
      ["answers", "Photo Day", "What if it rains?"],
      ["answers", "Photo Day", "What should my child wear?"],
      ["support", "Reply templates", "Reply templates"],
      ["support", "Reply templates", "Gallery link"],
      ["support", "Reply templates", "Needs info"],
    ]);
    expect(articles[1].body).toBe("We reschedule. *Keywords: rain*");
    expect(articles[4].body).toBe("> Hi [FIRST], here is the link: [GALLERY LINK]");
    expect(articles.map((a) => a.position)).toEqual([10, 20, 30, 40, 50, 60]);
    expect(JSON.stringify(articles)).not.toContain("Version notes");
  });

  it("keeps a section that is skipped out, and ignores a document with no sections", () => {
    expect(parseKnowledgeMarkdown(doc).some((a) => a.section === "Maintenance")).toBe(true);
    expect(parseKnowledgeMarkdown("Just a paragraph.")).toEqual([]);
  });

  it("drops a section number and keeps long text within the limits", () => {
    const [a] = parseKnowledgeMarkdown(`## 7) Support\n\n${"x".repeat(25000)}`);
    expect(a.section).toBe("Support");
    expect(a.body.length).toBe(20000);
  });
});

import { inline, toBlocks } from "@/lib/kb/blocks";

describe("knowledge base text", () => {
  it("reads paragraphs, lists, quotes and tables", () => {
    const blocks = toBlocks("Hello **there**\nfriend.\n\n- one\n- two\n\n> Hi [FIRST],\n> thanks\n\n| | |\n|---|---|\n| **Phone** | 555 |");
    expect(blocks.map((b) => b.kind)).toEqual(["p", "list", "quote", "table"]);
    expect(blocks[0]).toEqual({ kind: "p", parts: [{ text: "Hello " }, { text: "there", bold: true }, { text: " friend." }] });
    expect(blocks[3]).toEqual({ kind: "table", rows: [[[{ text: "Phone", bold: true }], [{ text: "555" }]]] });
  });

  it("links only to web and mail addresses", () => {
    expect(inline("[x](javascript:alert(1))")).toEqual([{ text: "x" }, { text: ")" }]);
    expect(inline("[book](https://example.com/a)")).toEqual([{ text: "book", href: "https://example.com/a" }]);
    expect(inline("at https://example.com/schedule.")).toEqual([{ text: "at " }, { text: "https://example.com/schedule", href: "https://example.com/schedule" }, { text: "." }]);
  });
});
