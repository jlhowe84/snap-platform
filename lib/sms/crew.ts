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
  const job = shorten(f.jobName);
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

export type DayBeforeFacts = {
  company: string | null;
  jobName: string;
  position: string;
  startTime: string | null;
  endTime: string | null;
  place: string | null;
  link: string;
};

/** The reminder the morning before a shift, with a link to the day's page. */
export function crewDayBeforeText(f: DayBeforeFacts): string {
  const company = f.company?.trim() || "Shifts";
  const role = (POSITION_LABEL[f.position] ?? f.position).toLowerCase();
  const times = [formatTime(f.startTime), formatTime(f.endTime)].filter(Boolean).join(" to ");
  const place = f.place && f.place.length > 60 ? `${f.place.slice(0, 57).trimEnd()}...` : f.place;
  const parts = [`${company}: Reminder, you work tomorrow as ${role}`, shorten(f.jobName), times, place].filter(Boolean).join(", ");
  return toGsm(`${parts}. Crew, kits and schedule: ${f.link} Reply STOP to opt out.`);
}

export type OfferFacts = {
  company: string | null;
  jobName: string;
  date: string;
  positions: string[];
  link: string;
};

/** A shift on a day has opened to this crew member; first to take it gets it. */
export function crewOfferText(f: OfferFacts): string {
  const company = f.company?.trim() || "Shifts";
  const roles = [...new Set(f.positions)].map((p) => (POSITION_LABEL[p] ?? p).toLowerCase());
  const what = roles.length === 1 ? `A ${roles[0]} shift is` : "Shifts are";
  const date = formatDate(f.date, { weekday: true });
  return toGsm(`${company}: ${what} open for you on ${date}, ${shorten(f.jobName)}. First to take it gets it: ${f.link} Reply STOP to opt out.`);
}

function shorten(job: string) {
  return job.length > MAX_JOB ? `${job.slice(0, MAX_JOB - 3).trimEnd()}...` : job;
}

export type OpenShift = { position: string; open_level: number | null };
export type OfferCrew = { id: string; positions: string[]; level: number | null };

/** The open positions a crew member could take, given the Levels the shifts are open to. */
export function offersFor(crew: OfferCrew, open: OpenShift[]): string[] {
  return open
    .filter((s) => crew.positions.includes(s.position))
    .filter((s) => s.open_level == null || (crew.level != null && crew.level <= s.open_level))
    .map((s) => s.position);
}

