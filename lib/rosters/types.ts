// What a roster upload may be (spec module 5). The bucket and the table
// enforce the same list; this copy lets the page say no before uploading.

export const ROSTER_MAX_BYTES = 25 * 1024 * 1024;

export const ROSTER_TYPES: Record<string, string> = {
  "text/csv": "CSV",
  "application/vnd.ms-excel": "Excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
};

const BY_EXTENSION: Record<string, string> = {
  csv: "text/csv",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

/** Browsers report CSV and Excel types unevenly, so the extension decides. */
export function rosterMime(fileName: string): string | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return BY_EXTENSION[ext] ?? null;
}

export const ROSTER_ACCEPT = ".csv,.xls,.xlsx,.pdf,.jpg,.jpeg,.png";

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
