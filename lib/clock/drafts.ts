import { formatDate } from "@/lib/dates";
import { renderMessage, type SavedMessages } from "@/lib/messages/catalog";

// Drafts for the approval queue. The wording is in lib/messages/catalog.ts (or
// the company's own, from Settings, Messages). These are plain templates: the same facts in
// the same order every time, so a person can approve them at a glance. The
// agent rewrites them in the league's voice once playbooks land (Dec 12).
// Nothing here sends: a draft is a row in agent_actions until a person
// approves it, and mail still passes lib/mail/guard.ts.

export type DraftKind =
  | "offers.send"
  | "holds.remind"
  | "chase.request"
  | "chase.reminder"
  | "chase.due_soon"
  | "chase.at_risk";

export type Draft = { to: string[]; subject: string; body: string };

export type DraftFacts = {
  companyName: string;
  leagueName: string;
  contactFirstName: string | null;
  to: string[];
  season?: string | null;
  photoDay?: string | null; // "YYYY-MM-DD"
  lastPhotoDay?: string | null;
  holdExpires?: string | null;
  dueOn?: string | null;
  /** The last day a roster and schedule can be taken (the agreement's deadline). */
  deadlineOn?: string | null;
  missing?: string[];
};

/** Stands in for the coordinator's portal link, which is made at send time. */
export const PORTAL_LINK = "[portal link]";

const MISSING_LABEL: Record<string, string> = {
  agreement: "Sign the photo day agreement",
  planning_form: "Fill in the planning form",
  roster: "Upload your roster",
  schedule: "Build your photo day schedule",
};

export function missingLines(missing: string[] = []) {
  return missing.map((m) => `- ${MISSING_LABEL[m] ?? m}`).join("\n");
}

const day = (iso?: string | null) => (iso ? formatDate(iso, { weekday: true }) : "your photo day");

export function buildDraft(kind: DraftKind, f: DraftFacts, saved?: SavedMessages | null): Draft {
  const message = renderMessage(
    kind,
    {
      contact: f.contactFirstName ?? "there",
      league: f.leagueName,
      company: f.companyName,
      season: f.season ?? "next season",
      last_season: f.lastPhotoDay ? `Last season your photo day was ${day(f.lastPhotoDay)}.` : "",
      photo_day: day(f.photoDay),
      hold_date: f.holdExpires ? (formatDate(f.holdExpires) ?? "soon") : "soon",
      hold_day: f.holdExpires ? (formatDate(f.holdExpires, { weekday: true }) ?? "its release date") : "its release date",
      due: day(f.dueOn),
      todo: missingLines(f.missing),
      deadline_note: f.deadlineOn ? `The last day we can take a roster and schedule is ${day(f.deadlineOn)}. After that we may need to move your photo day.` : "",
      portal_link: PORTAL_LINK,
    },
    saved,
  );
  return { to: f.to, ...message };
}

export const DRAFT_LABEL: Record<DraftKind, string> = {
  "offers.send": "Season offer",
  "holds.remind": "Hold reminder",
  "chase.request": "Planning request",
  "chase.reminder": "Reminder",
  "chase.due_soon": "Due in one week",
  "chase.at_risk": "Date at risk",
};

export function isDraftKind(value: string): value is DraftKind {
  return value in DRAFT_LABEL;
}

export function firstName(fullName: string | null | undefined) {
  return fullName?.trim().split(/\s+/)[0] || null;
}
