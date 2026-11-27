// The two delivery emails: the gallery-live notice with the parent kit, and
// the close-out after delivery. Plain templates filled with the job's facts
// and queued for a person to approve. No network and no database here. The
// wording is in lib/messages/catalog.ts, or the company's own from Settings,
// Messages.

import { formatDate } from "@/lib/dates";
import { renderMessage, type SavedMessages } from "@/lib/messages/catalog";
import { seasonForDate, shiftSeason } from "@/lib/season";

export const GALLERY_LIVE_KEY = "delivery.gallery_live";
export const CLOSEOUT_KEY = "delivery.closeout";
export const DELIVERY_LABEL_BY_KEY: Record<string, string> = {
  [GALLERY_LIVE_KEY]: "Galleries are live",
  [CLOSEOUT_KEY]: "Season close-out",
};
export const CLOSEOUT_DAYS_SETTING = "closeout.days_after_delivery";
export const DEFAULT_CLOSEOUT_DAYS = 14;

export type Draft = { to: string[]; subject: string; body: string };

export type GalleryLiveFacts = {
  company: string;
  league: string;
  contactFirstName: string | null;
  to: string[];
  galleryLink: string;
  coupon: string | null;
  /** "YYYY-MM-DD" */
  orderDeadline: string | null;
};

export function buildGalleryLive(f: GalleryLiveFacts, saved?: SavedMessages | null): Draft {
  const coupon = f.coupon?.trim();
  const message = renderMessage(
    GALLERY_LIVE_KEY,
    {
      contact: f.contactFirstName ?? "there",
      league: f.league,
      company: f.company,
      gallery_link: f.galleryLink,
      coupon_note: coupon ? `Parents can use the code ${coupon} at checkout.` : "",
      deadline_note: f.orderDeadline ? `Please order by ${formatDate(f.orderDeadline, { weekday: true })}.` : "",
    },
    saved,
  );
  return { to: f.to, ...message };
}

export type CloseoutFacts = {
  company: string;
  league: string;
  contactFirstName: string | null;
  to: string[];
  /** The job's first photo day, "YYYY-MM-DD", for the season name. */
  firstPhotoDay: string | null;
};

/** The season just photographed and the one to book: the same season next year. */
export function closeoutSeasons(firstPhotoDay: string | null): { season: string; next: string } {
  const season = seasonForDate(firstPhotoDay);
  if (!season) return { season: "season", next: "next season" };
  return { season, next: shiftSeason(season, 4) };
}

export function buildCloseout(f: CloseoutFacts, saved?: SavedMessages | null): Draft {
  const { season, next } = closeoutSeasons(f.firstPhotoDay);
  const message = renderMessage(
    CLOSEOUT_KEY,
    { contact: f.contactFirstName ?? "there", league: f.league, company: f.company, season, next_season: next },
    saved,
  );
  return { to: f.to, ...message };
}

/** The day close-out is due: the delivered day plus the setting's days. */
export function closeoutDueOn(deliveredDay: string, days: number): string {
  const d = new Date(`${deliveredDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The setting's value when it is a sensible number of days, else 14. */
export function readCloseoutDays(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 60 ? n : DEFAULT_CLOSEOUT_DAYS;
}
