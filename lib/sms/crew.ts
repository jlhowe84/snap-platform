// The wording crew agree to when they opt in to texts, and the texts
// themselves. Every text starts with the company's name and ends with how to
// stop, as carriers expect, and stays in the GSM character set (lib/sms/text).

import { formatDate, formatTime } from "@/lib/dates";
import { POSITION_LABEL } from "@/lib/staffing/plan";
import { toGsm } from "./text";

/** Bump when the opt-in wording changes, so each answer records what was shown. */
export const CONSENT_VERSION = "crew-v1";

export function consentWording(company: string | null): string {
  const name = company?.trim() || "the company";
  return (
    `Text me about my ${name} shifts: when I am added to or taken off a shift, when a new shift opens to me, ` +
    `and a reminder the day before I work. Usually a few messages a month. Message and data rates may apply. ` +
    `Reply STOP to stop at any time or HELP for help. Saying yes is not a condition of working with ${name}.`
  );
}

export type CrewTextFacts = {
  kind: "added" | "removed";
  company: string | null;
  jobName: string;
  date: string;
  position: string;
  startTime: string | null;
  endTime: string | null;
  link: string;
};

const MAX_JOB = 40;

/** One text, at most two segments, for a crew member put on or taken off a shift. */
export function crewShiftText(f: CrewTextFacts): string {
  const company = f.company?.trim() || "Shifts";
  const role = (POSITION_LABEL[f.position] ?? f.position).toLowerCase();
  const date = formatDate(f.date, { weekday: true });
  const times = [formatTime(f.startTime), formatTime(f.endTime)].filter(Boolean).join(" to ");
  const job = f.jobName.length > MAX_JOB ? `${f.jobName.slice(0, MAX_JOB - 3).trimEnd()}...` : f.jobName;
  const when = times ? `${date}, ${times}` : date;
  const text =
    f.kind === "added"
      ? `${company}: You're on a shift. ${capital(role)}, ${when}, ${job}. Details: ${f.link} Reply STOP to opt out.`
      : `${company}: You've been taken off your ${role} shift on ${date} (${job}). Your shifts: ${f.link} Reply STOP to opt out.`;
  return toGsm(text);
}

function capital(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
