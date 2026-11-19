// Turns a knowledge base written as Markdown (the company's customer service
// document) into articles. By rule only: no network, no database, no model.
//
//   ## 3. Photo Day          a section ("3." is dropped)
//   ### What if it rains?    a question: one article on the answers shelf
//   **Gallery link**         in a section with no questions, a line that is
//                            only bold text starts an article (templates)
//
// A section with neither is one article on the support shelf. Anything before
// the first "##" heading (front matter, version notes) is left out.

export type ImportedArticle = {
  shelf: "answers" | "support";
  section: string;
  title: string;
  body: string;
  position: number;
};

const MAX_TITLE = 200;
const MAX_BODY = 20000;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const sectionName = (s: string) => clean(s.replace(/^\d+[.)]\s*/, "").replace(/[*_`]/g, ""));
const titleOf = (s: string) => clean(s.replace(/[*_`#]/g, "")).slice(0, MAX_TITLE);

function bodyOf(lines: string[]): string {
  const kept = lines.filter((l) => !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l));
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_BODY);
}

type Block = { title: string | null; lines: string[] };

function split(lines: string[], heading: RegExp): Block[] {
  const blocks: Block[] = [{ title: null, lines: [] }];
  for (const line of lines) {
    const m = heading.exec(line);
    if (m) blocks.push({ title: m[1], lines: [] });
    else blocks[blocks.length - 1].lines.push(line);
  }
  return blocks;
}

export function parseKnowledgeMarkdown(markdown: string, options: { skipSections?: string[] } = {}): ImportedArticle[] {
  const skip = new Set((options.skipSections ?? []).map((s) => s.toLowerCase()));
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const sections = split(lines, /^##\s+(?!#)(.+?)\s*#*\s*$/).filter((b) => b.title !== null);
  const out: ImportedArticle[] = [];
  const add = (shelf: ImportedArticle["shelf"], section: string, title: string, body: string) => {
    if (!title || !body) return;
    out.push({ shelf, section, title, body, position: (out.length + 1) * 10 });
  };

  for (const s of sections) {
    const section = sectionName(s.title!);
    if (!section || skip.has(section.toLowerCase())) continue;
    const questions = split(s.lines, /^###\s+(.+?)\s*#*\s*$/);
    if (questions.length > 1) {
      add("support", section, section, bodyOf(questions[0].lines));
      for (const q of questions.slice(1)) add("answers", section, titleOf(q.title!), bodyOf(q.lines));
      continue;
    }
    const parts = split(s.lines, /^\s*\*\*([^*]+?)\*\*\s*$/);
    if (parts.length > 2) {
      add("support", section, section, bodyOf(parts[0].lines));
      for (const p of parts.slice(1)) add("support", section, titleOf(p.title!), bodyOf(p.lines));
      continue;
    }
    add("support", section, section, bodyOf(s.lines));
  }
  return out;
}
