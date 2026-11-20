// The notes a crew member gets when the office puts them on a shift or takes
// them off. They wait in the approval queue like every other message, and
// while mail is in test mode they go to the test address only.

import { formatDate, formatTime } from "@/lib/dates";
import { POSITION_LABEL } from "./plan";

export const CREW_NOTICE_KEY = "crew.notify";
export const CREW_NOTICE_LABEL = "Crew shift notice";

export type CrewNoticeFacts = {
  kind: "added" | "removed";
  firstName: string | null;
  jobName: string;
  date: string;
  position: string;
  startTime: string | null;
  endTime: string | null;
  place: string | null;
  shiftsUrl: string;
  companyName: string | null;
};

export function crewNotice(f: CrewNoticeFacts): { subject: string; body: string } {
  const when = formatDate(f.date, { weekday: true });
  const role = (POSITION_LABEL[f.position] ?? f.position).toLowerCase();
  const times = [formatTime(f.startTime), formatTime(f.endTime)].filter(Boolean).join(" to ");
  const hi = f.firstName ? `Hi ${f.firstName},` : "Hi,";
  const sign = f.companyName ? `Thanks,\n${f.companyName}` : "Thanks";
  if (f.kind === "added") {
    return {
      subject: `You're on for ${f.jobName}, ${when}`,
      body: [
        hi,
        `You're booked as ${role} for ${f.jobName} on ${when}${times ? `, ${times}` : ""}.`,
        f.place ? `Where: ${f.place}` : null,
        `Your shifts are here: ${f.shiftsUrl}`,
        "If you can't make it, let the office know as soon as you can.",
        sign,
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  }
  return {
    subject: `Change to your shift on ${when}`,
    body: [
      hi,
      `You're no longer booked as ${role} for ${f.jobName} on ${when}. Nothing else changes, and you don't need to do anything.`,
      `Your shifts are here: ${f.shiftsUrl}`,
      sign,
    ].join("\n\n"),
  };
}

export function firstNameOf(fullName: string | null | undefined): string | null {
  const first = (fullName ?? "").trim().split(/\s+/)[0];
  return first ? first : null;
}
