export const KB_SHELVES = ["answers", "support", "handbook"] as const;
export type KbShelf = (typeof KB_SHELVES)[number];
export const KB_STATUSES = ["published", "draft", "retired"] as const;
export type KbStatus = (typeof KB_STATUSES)[number];

export const SHELF_LABEL: Record<KbShelf, string> = {
  answers: "Answers for parents",
  support: "Support desk",
  handbook: "Staff handbook",
};
export const SHELF_HINT: Record<KbShelf, string> = {
  answers: "What parents ask, in our approved wording. Support drafts use these, and the parent help center will.",
  support: "How the desk works: voice, handling rules, reply templates, company facts and the questions still to settle.",
  handbook: "How we do the work: production, gear, the on-site process.",
};
export const STATUS_LABEL: Record<KbStatus, string> = { published: "Published", draft: "Draft", retired: "Retired" };

export const isShelf = (v: unknown): v is KbShelf => typeof v === "string" && (KB_SHELVES as readonly string[]).includes(v);
export const isStatus = (v: unknown): v is KbStatus => typeof v === "string" && (KB_STATUSES as readonly string[]).includes(v);

/** Placeholders like [GALLERY LINK] are for staff to fill in, never for parents. */
export const SLOT_PATTERN = /\[[A-Z][A-Z0-9 _'/-]{2,}\]/;
