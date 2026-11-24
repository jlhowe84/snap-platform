// Finds a booked player in a Captura gallery so the photo slip can carry
// their online code. No network here; the gallery answer is passed in.
// Captura's live answers differ a little from its spec, so no field is
// assumed present.

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};
const words = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);

export type SlipSubject = { name: string | null; team: string | null; onlineCode: string | null };
export type SubjectSearch = { found: SlipSubject } | { found: null; why: "none" | "several" };

const CODE = /^[A-Za-z0-9-]{1,40}$/;

/**
 * The player a booking is for. An order's own player ids win; without them
 * the name must match exactly one player, so a slip never carries a
 * namesake's code.
 */
export function findSubject(rawGallery: unknown, want: { subjectIds?: string[]; name?: string | null }): SubjectSearch {
  const gallery = obj(rawGallery);
  const teams = new Map<string, string>();
  for (const g of arr(gallery.groups)) {
    const group = obj(g);
    const id = str(group.id);
    const title = str(group.name) ?? str(group.title);
    if (id && title) teams.set(id, title);
  }
  const shape = (subject: Raw): SlipSubject => {
    const code = str(subject.onlineCode);
    return {
      name: [str(subject.firstName), str(subject.lastName)].filter(Boolean).join(" ").slice(0, 120) || null,
      team:
        arr(subject.galleryGroups)
          .map((g) => teams.get(str(typeof g === "object" ? obj(g).id : g) ?? ""))
          .filter(Boolean)
          .join(", ")
          .slice(0, 160) || null,
      onlineCode: code && CODE.test(code) ? code : null,
    };
  };
  const subjects = arr(gallery.subjects).map(obj);

  const ids = new Set((want.subjectIds ?? []).map(String));
  if (ids.size) {
    const byId = subjects.filter((s) => ids.has(str(s.id) ?? "") || ids.has(str(s.subjectID) ?? ""));
    if (byId.length === 1) return { found: shape(byId[0]) };
    if (byId.length > 1) return { found: null, why: "several" };
  }
  const wanted = words(want.name ?? "");
  if (wanted.length < 2) return { found: null, why: "none" };
  const byName = subjects.filter((s) => {
    const have = words([str(s.firstName), str(s.lastName)].filter(Boolean).join(" "));
    return have.length > 0 && wanted.every((w) => have.includes(w));
  });
  if (byName.length === 1) return { found: shape(byName[0]) };
  return { found: null, why: byName.length ? "several" : "none" };
}
