import { formatDate } from "@/lib/dates";

// Drafts for the approval queue. These are plain templates: the same facts in
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

export function buildDraft(kind: DraftKind, f: DraftFacts): Draft {
  const hi = `Hi ${f.contactFirstName ?? "there"},`;
  const sign = `Thank you,\n${f.companyName}`;
  const todo = missingLines(f.missing);
  const where = `Everything is in one place: ${PORTAL_LINK}`;
  const lastDay = f.deadlineOn
    ? ` The last day we can take a roster and schedule is ${day(f.deadlineOn)}. After that we may need to move your photo day.`
    : "";

  switch (kind) {
    case "offers.send":
      return {
        to: f.to,
        subject: `${f.leagueName}: your ${f.season} photo day`,
        body: [
          hi,
          `We are planning ${f.season} and would love to photograph ${f.leagueName} again.` +
            (f.lastPhotoDay ? ` Last season your photo day was ${day(f.lastPhotoDay)}.` : ""),
          "Reply with the date you would like, or a couple of options, and we will hold it for you while you confirm.",
          sign,
        ].join("\n\n"),
      };
    case "holds.remind":
      return {
        to: f.to,
        subject: `${f.leagueName}: your held date releases ${f.holdExpires ? formatDate(f.holdExpires) : "soon"}`,
        body: [
          hi,
          `We are holding ${day(f.photoDay)} for ${f.leagueName}. The hold releases on ${f.holdExpires ? formatDate(f.holdExpires, { weekday: true }) : "its release date"} so the date can go to the next league waiting.`,
          `To keep it, sign the photo day agreement here: ${PORTAL_LINK}`,
          "If you need a few more days, reply and let us know.",
          sign,
        ].join("\n\n"),
      };
    case "chase.request":
      return {
        to: f.to,
        subject: `${f.leagueName}: getting ready for photo day on ${day(f.photoDay)}`,
        body: [
          hi,
          `Photo day for ${f.leagueName} is ${day(f.photoDay)}. To have everything ready, we need the following by ${day(f.dueOn)}:`,
          todo,
          where,
          sign,
        ].join("\n\n"),
      };
    case "chase.reminder":
      return {
        to: f.to,
        subject: `${f.leagueName}: still needed for photo day`,
        body: [
          hi,
          `A quick reminder for photo day on ${day(f.photoDay)}. We still need:`,
          todo,
          `These are due by ${day(f.dueOn)}. ${where}`,
          sign,
        ].join("\n\n"),
      };
    case "chase.due_soon":
      return {
        to: f.to,
        subject: `${f.leagueName}: due in one week`,
        body: [
          hi,
          `Photo day is ${day(f.photoDay)}, and the items below are due in one week, by ${day(f.dueOn)}:`,
          todo,
          ...(lastDay ? [lastDay.trim()] : []),
          `${where}\n\nWe will also give you a call this week in case it is easier to sort out by phone.`,
          sign,
        ].join("\n\n"),
      };
    case "chase.at_risk":
      return {
        to: f.to,
        subject: `${f.leagueName}: your photo day on ${day(f.photoDay)} is at risk`,
        body: [
          hi,
          `Photo day for ${f.leagueName} is ${day(f.photoDay)}, and we are still missing:`,
          todo,
          "Without these we cannot prepare your teams and schedule in time. Please send them today, or reply so we can talk through options." + lastDay,
          where,
          sign,
        ].join("\n\n"),
      };
  }
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
