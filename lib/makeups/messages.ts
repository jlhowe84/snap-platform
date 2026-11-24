// The words of the scheduler's own messages. Plain text, no network.

import { formatDate, formatTime } from "@/lib/dates";
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

/** What the parent gets after booking: when, where, and their own link to cancel. */
export function parentConfirmation(b: BookingFacts, o: { company: string; place: string; details: string; manageUrl: string }) {
  const lines = [
    `Hi ${firstName(b.parentName)},`,
    `${b.player} is booked for a ${KIND_LABEL[b.kind].toLowerCase()} session on ${whenLine(b)}.`,
    o.place ? `Where: ${o.place}` : null,
    o.details || null,
    `If you can no longer make it, cancel here any time before the session starts:\n${o.manageUrl}`,
    `Thank you,\n${o.company}`,
  ];
  return {
    subject: `${KIND_LABEL[b.kind]} session booked for ${b.player}: ${whenLine(b)}`,
    body: lines.filter(Boolean).join("\n\n"),
  };
}

/** What the parent gets when the office moves their session to another time. */
export function parentMoved(b: BookingFacts, o: { company: string; place: string; details: string; manageUrl: string }) {
  const lines = [
    `Hi ${firstName(b.parentName)},`,
    `The ${KIND_LABEL[b.kind].toLowerCase()} session for ${b.player} has a new time: ${whenLine(b)}.`,
    o.place ? `Where: ${o.place}` : null,
    o.details || null,
    `If the new time does not work, cancel here any time before the session starts and book another:\n${o.manageUrl}`,
    `Thank you,\n${o.company}`,
  ];
  return { subject: `New time for ${b.player}'s ${KIND_LABEL[b.kind].toLowerCase()} session: ${whenLine(b)}`, body: lines.filter(Boolean).join("\n\n") };
}

/** What the parent gets when the office cancels their session. */
export function parentCancelled(b: BookingFacts, o: { company: string; bookUrl: string }) {
  return {
    subject: `${KIND_LABEL[b.kind]} session cancelled for ${b.player}`,
    body: [
      `Hi ${firstName(b.parentName)},`,
      `The ${KIND_LABEL[b.kind].toLowerCase()} session for ${b.player} on ${whenLine(b)} has been cancelled.`,
      `You can book another time here:\n${o.bookUrl}`,
      `Thank you,\n${o.company}`,
    ].join("\n\n"),
  };
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
export function officeAlert(b: BookingFacts, what: "booked" | "cancelled", listUrl: string) {
  return {
    subject: `${KIND_LABEL[b.kind]} ${what}: ${b.player}, ${whenLine(b)}`,
    body: [`A ${KIND_LABEL[b.kind].toLowerCase()} session was ${what} for ${whenLine(b)}.`, factLines(b), `Bookings and photo slips:\n${listUrl}`].join("\n\n"),
  };
}

/** The morning list for the office. */
export function officeDigest(date: string, rows: Pick<BookingFacts, "kind" | "player" | "team" | "league" | "time">[], listUrl: string) {
  const n = rows.length;
  return {
    subject: `${n} makeup or retake session${n === 1 ? "" : "s"} today, ${formatDate(date, { weekday: true })}`,
    body: [
      `On the list for today:`,
      rows.map((r) => `${formatTime(r.time)}  ${r.player} (${KIND_LABEL[r.kind]})${[r.league, r.team].filter(Boolean).length ? `, ${[r.league, r.team].filter(Boolean).join(", ")}` : ""}`).join("\n"),
      `Bookings and photo slips:\n${listUrl}`,
    ].join("\n\n"),
  };
}
