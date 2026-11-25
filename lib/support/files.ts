import type { Attachment } from "./parse";

// Small rules about the files that come with support mail. No network here.

/** Kinds a browser may show in place. Everything else is handed over as a download. */
const SHOW_IN_PLACE = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"]);

export function showsInPlace(type: string): boolean {
  return SHOW_IN_PLACE.has(type.toLowerCase());
}

/** Reads the stored list on a message row, dropping anything not shaped like an attachment. */
export function readAttachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (a): a is Attachment =>
      !!a && typeof a === "object" && typeof a.part === "string" && typeof a.name === "string" &&
      typeof a.type === "string" && typeof a.size === "number",
  );
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
