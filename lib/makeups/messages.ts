// The scheduler's own messages: the facts of a booking, put into the wording
// in lib/messages/catalog.ts (or the company's own, from Settings, Messages).
// Plain text, no network.

import { formatDate, formatTime } from "@/lib/dates";
import { renderMessage, type SavedMessages } from "@/lib/messages/catalog";
import { KIND_LABEL, type Kind } from "./schedule";

export type BookingFacts = {
  kind: Kind;
  player: string;
  league: string | null;
  team: string | null;
  date: string;
  time: string;
  parentName: string | null;
  email: string | null;
  phone: string | null;
  orderNumber: number | null;
  note: string | null;
};

export const whenLine = (b: Pick<BookingFacts, "date" | "time">) => `${formatDate(b.date, { weekday: true })} at ${formatTime(b.time)}`;

const firstName = (name: string | null) => name?.trim().split(/\s+/)[0] || "there";

type Saved = SavedMessages | null;

function parentWords(b: BookingFacts, o: { company: string; place?: string; details?: string; link: string }) {
  return {
    parent: firstName(b.parentName),
    player: b.player,
    kind: KIND_LABEL[b.kind].toLowerCase(),
    Kind: KIND_LABEL[b.kind],
    when: whenLine(b),
    time: formatTime(b.time) ?? "",
    place: o.place ?? "",
    details: o.details ?? "",
    link: o.link,
    company: o.company,
  };
}

/** What the parent gets after booking: when, where, and their own link to cancel. */
export function parentConfirmation(b: BookingFacts, o: { company: string; place: string; details: string; manageUrl: string }, saved?: Saved) {
  return renderMessage("makeup.confirmation", parentWords(b, { ...o, link: o.manageUrl }), saved);
}

/** What the parent gets the morning before their session. */
export function parentReminder(b: BookingFacts, o: { company: string; place: string; details: string; manageUrl: string }, saved?: Saved) {
  return renderMessage("makeup.reminder", parentWords(b, { ...o, link: o.manageUrl }), saved);
}

/** What the parent gets when the office moves their session to another time. */
export function parentMoved(b: BookingFacts, o: { company: string; place: string; details: string; manageUrl: string }, saved?: Saved) {
  return renderMessage("makeup.moved", parentWords(b, { ...o, link: o.manageUrl }), saved);
}

/** What the parent gets when the office cancels their session. */
export function parentCancelled(b: BookingFacts, o: { company: string; bookUrl: string }, saved?: Saved) {
  return renderMessage("makeup.cancelled", parentWords(b, { company: o.company, link: o.bookUrl }), saved);
}

function factLines(b: BookingFacts) {
  return [
    `Player: ${b.player}`,
    b.league ? `League: ${b.league}` : null,
    b.team ? `Team: ${b.team}` : null,
    b.orderNumber ? `Order: ${b.orderNumber}` : null,
    b.parentName ? `Parent: ${b.parentName}` : null,
    b.email ? `Email: ${b.email}` : null,
    b.phone ? `Phone: ${b.phone}` : null,
    b.note ? `Note: ${b.note}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** What the office gets when a booking is made or cancelled. */
export function officeAlert(b: BookingFacts, what: "booked" | "cancelled", listUrl: string, saved?: Saved) {
  return renderMessage(
    "makeup.office_alert",
    { kind: KIND_LABEL[b.kind].toLowerCase(), Kind: KIND_LABEL[b.kind], what, player: b.player, when: whenLine(b), facts: factLines(b), link: listUrl },
    saved,
  );
}

/** The morning list for the office. */
export function officeDigest(date: string, rows: Pick<BookingFacts, "kind" | "player" | "team" | "league" | "time">[], listUrl: string, saved?: Saved) {
  const n = rows.length;
  return renderMessage(
    "makeup.office_digest",
    {
      count: `${n} makeup or retake session${n === 1 ? "" : "s"}`,
      date: formatDate(date, { weekday: true }) ?? "",
      sessions: rows
        .map((r) => `${formatTime(r.time)}  ${r.player} (${KIND_LABEL[r.kind]})${[r.league, r.team].filter(Boolean).length ? `, ${[r.league, r.team].filter(Boolean).join(", ")}` : ""}`)
        .join("\n"),
      link: listUrl,
    },
    saved,
  );
}
