import { formatDate } from "@/lib/dates";
import { PORTAL_LINK, type Draft } from "@/lib/clock/drafts";

// The notice a coordinator gets when a photo day moves, is postponed or is
// cancelled. A plain template, like the clock's drafts: it waits in the
// approval queue and a person can reword it before it goes.

export const DATE_CHANGE_KINDS = ["reschedule", "postpone", "cancel"] as const;
export type DateChangeKind = (typeof DATE_CHANGE_KINDS)[number];

export const DATE_CHANGE_LABEL: Record<DateChangeKind, string> = {
  reschedule: "Moved",
  postpone: "Postponed",
  cancel: "Cancelled",
};

export const DATE_NOTICE_KEY = "dates.notify";
export const DATE_NOTICE_LABEL = "Date change notice";

export type DateNoticeFacts = {
  kind: DateChangeKind;
  companyName: string;
  leagueName: string;
  contactFirstName: string | null;
  to: string[];
  fromDate: string;
  toDate?: string | null;
};

export function buildDateNotice(f: DateNoticeFacts): Draft {
  const hi = `Hi ${f.contactFirstName ?? "there"},`;
  const sign = `Thank you,\n${f.companyName}`;
  const was = formatDate(f.fromDate, { weekday: true });

  if (f.kind === "reschedule") {
    const now = formatDate(f.toDate, { weekday: true });
    return {
      to: f.to,
      subject: `${f.leagueName}: your photo day has moved to ${now}`,
      body: [
        hi,
        `Your photo day for ${f.leagueName} has moved from ${was} to ${now}.`,
        "Everything you have already sent us stays as it is. Please check that your schedule still works on the new date.",
        `Everything is in one place: ${PORTAL_LINK}`,
        "If the new date does not work for your league, reply and we will sort it out.",
        sign,
      ].join("\n\n"),
    };
  }
  if (f.kind === "postpone") {
    return {
      to: f.to,
      subject: `${f.leagueName}: your photo day on ${was} is postponed`,
      body: [
        hi,
        `Your photo day for ${f.leagueName} on ${was} is postponed.`,
        "We will be in touch with the new date. Everything you have already sent us stays as it is.",
        "If you have questions, reply to this email.",
        sign,
      ].join("\n\n"),
    };
  }
  return {
    to: f.to,
    subject: `${f.leagueName}: your photo day on ${was} is cancelled`,
    body: [
      hi,
      `Your photo day for ${f.leagueName} on ${was} is cancelled.`,
      "If you have questions, or would like to pick a new date, reply to this email.",
      sign,
    ].join("\n\n"),
  };
}
