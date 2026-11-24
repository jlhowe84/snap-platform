// The notes a crew member gets when the office puts them on a shift or takes
// them off. They wait in the approval queue like every other message, and
// while mail is in test mode they go to the test address only.

import { formatDate, formatTime } from "@/lib/dates";
import { renderMessage, type SavedMessages } from "@/lib/messages/catalog";
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

export function crewNotice(f: CrewNoticeFacts, saved?: SavedMessages | null): { subject: string; body: string } {
  const date = formatDate(f.date, { weekday: true }) ?? "";
  const times = [formatTime(f.startTime), formatTime(f.endTime)].filter(Boolean).join(" to ");
  return renderMessage(
    f.kind === "added" ? "crew.added" : "crew.removed",
    {
      first_name: f.firstName ?? "there",
      role: (POSITION_LABEL[f.position] ?? f.position).toLowerCase(),
      job: f.jobName,
      date,
      shift: times ? `${date}, ${times}` : date,
      place: f.place ?? "",
      link: f.shiftsUrl,
      company: f.companyName ?? "",
    },
    saved,
  );
}

export function firstNameOf(fullName: string | null | undefined): string | null {
  const first = (fullName ?? "").trim().split(/\s+/)[0];
  return first ? first : null;
}
