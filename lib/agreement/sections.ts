import type { AgreementSection } from "./pdf";

// The agreement editor is one text box. Each section starts with a "## Title"
// line; adding "[initial]" to the title asks the signer to initial it.
//
//   ## Session fee [initial]
//   The league pays ...
//
// Keys come from the titles, so the same title keeps the same key across
// versions and initials stay comparable.

export function slugKey(title: string) {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "section"
  );
}

export function parseSections(text: string): AgreementSection[] {
  const sections: AgreementSection[] = [];
  let current: AgreementSection | null = null;
  const used = new Set<string>();
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const heading = raw.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      if (current) sections.push(current);
      const initial = /\[initial\]/i.test(heading[1]);
      const title = heading[1].replace(/\[initial\]/gi, "").trim() || "Untitled";
      let key = slugKey(title);
      for (let n = 2; used.has(key); n++) key = `${slugKey(title)}_${n}`;
      used.add(key);
      current = { key, title, body: "", initial };
    } else if (current) {
      current.body += (current.body ? "\n" : "") + raw;
    } else if (raw.trim()) {
      current = { key: "introduction", title: "Introduction", body: raw, initial: false };
      used.add("introduction");
    }
  }
  if (current) sections.push(current);
  return sections.map((s) => ({ ...s, body: s.body.trim() }));
}

export function formatSections(sections: AgreementSection[]) {
  return sections
    .map((s) => `## ${s.title}${s.initial ? " [initial]" : ""}\n${s.body}`)
    .join("\n\n");
}

export function asSections(value: unknown): AgreementSection[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({
      key: String(s.key ?? ""),
      title: String(s.title ?? ""),
      body: String(s.body ?? ""),
      initial: s.initial === true,
    }))
    .filter((s) => s.key);
}
