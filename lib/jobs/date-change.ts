import { formatDate } from "@/lib/dates";
import { PORTAL_LINK, type Draft } from "@/lib/clock/drafts";
import { renderMessage, type SavedMessages } from "@/lib/messages/catalog";

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

export function buildDateNotice(f: DateNoticeFacts, saved?: SavedMessages | null): Draft {
  const message = renderMessage(
    `dates.${f.kind}`,
    {
      contact: f.contactFirstName ?? "there",
      league: f.leagueName,
      company: f.companyName,
      old_date: formatDate(f.fromDate, { weekday: true }) ?? "",
      new_date: formatDate(f.toDate, { weekday: true }) ?? "",
      portal_link: PORTAL_LINK,
    },
    saved,
  );
  return { to: f.to, ...message };
}
