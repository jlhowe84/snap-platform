// Every email the platform writes, in one place: what it is, when it goes,
// the fill-in fields it may use and the wording a company starts from. A
// company's own wording is a settings row per message (see settingKeyOf);
// Settings, Messages edits it. Pure: no network and no database, so a page
// can preview a message exactly as the server will write it.
//
// A new email is added here first, then written with renderMessage. A test
// fails when an email's starting text uses a field its entry does not list.

export type MessageGroup = "parents" | "coordinators" | "crew" | "office";

export const GROUP_LABEL: Record<MessageGroup, string> = {
  parents: "Parents",
  coordinators: "League coordinators",
  crew: "Crew",
  office: "The office",
};

export type MessageField = {
  name: string;
  what: string;
  sample: string;
  /** The message is no use without it (a link to act on), so a save without it is refused. */
  required?: boolean;
};

export type MessageDef = {
  key: string;
  group: MessageGroup;
  label: string;
  /** When it goes out, in a sentence. */
  when: string;
  /** "auto" goes on its own; "queue" waits for a person to approve it, and they can reword that one copy. */
  sends: "auto" | "queue";
  fields: MessageField[];
  subject: string;
  body: string;
  /** Set only where a message already had a settings row before this catalog existed. */
  settingKey?: string;
};

export type Template = { subject: string; body: string };
/** Settings values by setting key, as loaded for one company. */
export type SavedMessages = Record<string, unknown>;

const para = (...p: string[]) => p.join("\n\n");

const f = {
  company: { name: "company", what: "Your company's name", sample: "Photo Co" },
  parent: { name: "parent", what: "The parent's first name, or \"there\"", sample: "Dana" },
  player: { name: "player", what: "The player's name", sample: "Ben Example" },
  kind: { name: "kind", what: "\"makeup\" or \"retake\"", sample: "makeup" },
  Kind: { name: "Kind", what: "\"Makeup\" or \"Retake\", with a capital", sample: "Makeup" },
  when: { name: "when", what: "The session's day and time", sample: "Mon, Mar 1, 2027 at 10:20 AM" },
  place: { name: "place", what: "Where sessions happen, from Settings, Makeups", sample: "Our studio, 1 Main St" },
  details: { name: "details", what: "What to bring or know, from Settings, Makeups", sample: "Please bring the full uniform." },
  contact: { name: "contact", what: "The coordinator's first name, or \"there\"", sample: "Pat" },
  league: { name: "league", what: "The league's name", sample: "River League" },
  photo_day: { name: "photo_day", what: "The photo day's date", sample: "Sat, Apr 17, 2027" },
  due: { name: "due", what: "The day the planning items are due", sample: "Sat, Mar 27, 2027" },
  todo: { name: "todo", what: "The list of what is still missing, one per line", sample: "- Upload your roster\n- Build your photo day schedule" },
  portal_link: { name: "portal_link", what: "The coordinator's own portal link, made when the email is sent", sample: "https://example.com/p/your-link", required: true },
  deadline_note: {
    name: "deadline_note",
    what: "A sentence naming the last day a roster and schedule can be taken, when there is one",
    sample: "The last day we can take a roster and schedule is Wed, Apr 7, 2027. After that we may need to move your photo day.",
  },
} satisfies Record<string, MessageField>;

const cancelLink: MessageField = { name: "link", what: "The parent's own link to cancel", sample: "https://example.com/help/photo-co/makeup/b/your-link", required: true };
const listLink: MessageField = { name: "link", what: "The bookings page for that day", sample: "https://example.com/production/makeups?date=2027-03-01" };

export const MESSAGES: MessageDef[] = [
  {
    key: "makeup.confirmation",
    group: "parents",
    label: "Makeup or retake booked",
    when: "Right after a parent books a session, or the office books one for them.",
    sends: "auto",
    fields: [f.parent, f.player, f.kind, f.Kind, f.when, f.place, f.details, cancelLink, f.company],
    subject: "{Kind} session booked for {player}: {when}",
    body: para(
      "Hi {parent},",
      "{player} is booked for a {kind} session on {when}.",
      "Where: {place}",
      "{details}",
      "If you can no longer make it, cancel here any time before the session starts:\n{link}",
      "Thank you,\n{company}",
    ),
  },
  {
    key: "makeup.reminder",
    group: "parents",
    label: "Makeup or retake reminder",
    when: "The morning before the session.",
    sends: "auto",
    fields: [f.parent, f.player, f.kind, f.Kind, f.when, { name: "time", what: "The session's time", sample: "10:20 AM" }, f.place, f.details, cancelLink, f.company],
    subject: "Reminder: {player}'s {kind} session is tomorrow at {time}",
    body: para(
      "Hi {parent},",
      "A reminder that {player} has a {kind} session tomorrow, {when}.",
      "Where: {place}",
      "{details}",
      "If you can no longer make it, please cancel here so the time opens up for another family:\n{link}",
      "See you then,\n{company}",
    ),
  },
  {
    key: "makeup.moved",
    group: "parents",
    label: "Makeup or retake moved",
    when: "When the office moves a session to a new time and chooses to email the parent.",
    sends: "auto",
    fields: [f.parent, f.player, f.kind, f.Kind, f.when, f.place, f.details, cancelLink, f.company],
    subject: "New time for {player}'s {kind} session: {when}",
    body: para(
      "Hi {parent},",
      "The {kind} session for {player} has a new time: {when}.",
      "Where: {place}",
      "{details}",
      "If the new time does not work, cancel here any time before the session starts and book another:\n{link}",
      "Thank you,\n{company}",
    ),
  },
  {
    key: "makeup.cancelled",
    group: "parents",
    label: "Makeup or retake cancelled",
    when: "When the office cancels a session and chooses to email the parent.",
    sends: "auto",
    fields: [f.parent, f.player, f.kind, f.Kind, f.when, { name: "link", what: "The booking page, to pick another time", sample: "https://example.com/help/photo-co/makeup" }, f.company],
    subject: "{Kind} session cancelled for {player}",
    body: para("Hi {parent},", "The {kind} session for {player} on {when} has been cancelled.", "You can book another time here:\n{link}", "Thank you,\n{company}"),
  },
  {
    key: "prepay.makeup_offer",
    settingKey: "prepay.makeup_offer",
    group: "parents",
    label: "Makeup offer for a preorder with no photos",
    when: "When the office drafts an offer from the prepay orders with no photos list.",
    sends: "queue",
    fields: [
      f.parent,
      f.player,
      { name: "league", what: "The league's name, or \"your league\"", sample: "River League" },
      { name: "order", what: "The order number", sample: "60000001" },
      { name: "booking", what: "The booking page with this order filled in", sample: "https://example.com/help/photo-co/makeup?order=60000001" },
      f.company,
    ],
    subject: "Your {company} preorder for {player}",
    body: para(
      "Hi {parent},",
      "Thank you for your preorder. We are sorry we missed {player} on photo day for {league}, so we have no photos to go with order {order}.",
      "We would love to make it right with a makeup session. Reply to this email and we will set up a time that works for you.",
      "If a makeup session will not work, reply and let us know, and we will refund your order.",
      "Thank you,\n{company}",
    ),
  },
  {
    key: "offers.send",
    group: "coordinators",
    label: "Season offer",
    when: "When the office sends offers from the Season board.",
    sends: "queue",
    fields: [
      f.contact,
      f.league,
      { name: "season", what: "The season being planned", sample: "Spring 2027" },
      { name: "last_season", what: "A sentence naming last season's photo day, when there was one", sample: "Last season your photo day was Sat, Apr 18, 2026." },
      f.company,
    ],
    subject: "{league}: your {season} photo day",
    body: para(
      "Hi {contact},",
      "We are planning {season} and would love to photograph {league} again. {last_season}",
      "Reply with the date you would like, or a couple of options, and we will hold it for you while you confirm.",
      "Thank you,\n{company}",
    ),
  },
  {
    key: "holds.remind",
    group: "coordinators",
    label: "Hold reminder",
    when: "Before a held date releases.",
    sends: "queue",
    fields: [
      f.contact,
      f.league,
      f.photo_day,
      { name: "hold_date", what: "The day the hold releases, short", sample: "Dec 9, 2026" },
      { name: "hold_day", what: "The day the hold releases, with the weekday", sample: "Wed, Dec 9, 2026" },
      f.portal_link,
      f.company,
    ],
    subject: "{league}: your held date releases {hold_date}",
    body: para(
      "Hi {contact},",
      "We are holding {photo_day} for {league}. The hold releases on {hold_day} so the date can go to the next league waiting.",
      "To keep it, sign the photo day agreement here: {portal_link}",
      "If you need a few more days, reply and let us know.",
      "Thank you,\n{company}",
    ),
  },
  {
    key: "chase.request",
    group: "coordinators",
    label: "Planning request",
    when: "The first ask for the agreement, planning form, roster and schedule.",
    sends: "queue",
    fields: [f.contact, f.league, f.photo_day, f.due, f.todo, f.portal_link, f.company],
    subject: "{league}: getting ready for photo day on {photo_day}",
    body: para(
      "Hi {contact},",
      "Photo day for {league} is {photo_day}. To have everything ready, we need the following by {due}:",
      "{todo}",
      "Everything is in one place: {portal_link}",
      "Thank you,\n{company}",
    ),
  },
  {
    key: "chase.reminder",
    group: "coordinators",
    label: "Planning reminder",
    when: "When planning items are still missing after the first ask.",
    sends: "queue",
    fields: [f.contact, f.league, f.photo_day, f.due, f.todo, f.portal_link, f.company],
    subject: "{league}: still needed for photo day",
    body: para(
      "Hi {contact},",
      "A quick reminder for photo day on {photo_day}. We still need:",
      "{todo}",
      "These are due by {due}. Everything is in one place: {portal_link}",
      "Thank you,\n{company}",
    ),
  },
  {
    key: "chase.due_soon",
    group: "coordinators",
    label: "Planning items due in one week",
    when: "One week before the planning items are due.",
    sends: "queue",
    fields: [f.contact, f.league, f.photo_day, f.due, f.todo, f.deadline_note, f.portal_link, f.company],
    subject: "{league}: due in one week",
    body: para(
      "Hi {contact},",
      "Photo day is {photo_day}, and the items below are due in one week, by {due}:",
      "{todo}",
      "{deadline_note}",
      "Everything is in one place: {portal_link}",
      "We will also give you a call this week in case it is easier to sort out by phone.",
      "Thank you,\n{company}",
    ),
  },
  {
    key: "chase.at_risk",
    group: "coordinators",
    label: "Photo day at risk",
    when: "When planning items are past due and the date is in danger.",
    sends: "queue",
    fields: [f.contact, f.league, f.photo_day, f.due, f.todo, f.deadline_note, f.portal_link, f.company],
    subject: "{league}: your photo day on {photo_day} is at risk",
    body: para(
      "Hi {contact},",
      "Photo day for {league} is {photo_day}, and we are still missing:",
      "{todo}",
      "Without these we cannot prepare your teams and schedule in time. Please send them today, or reply so we can talk through options.",
      "{deadline_note}",
      "Everything is in one place: {portal_link}",
      "Thank you,\n{company}",
    ),
  },
  {
    key: "dates.reschedule",
    group: "coordinators",
    label: "Photo day moved",
    when: "When a photo day moves to a new date and the office chooses to tell the league.",
    sends: "queue",
    fields: [
      f.contact,
      f.league,
      { name: "old_date", what: "The date it was", sample: "Sat, May 4, 2030" },
      { name: "new_date", what: "The new date", sample: "Sat, May 11, 2030" },
      f.portal_link,
      f.company,
    ],
    subject: "{league}: your photo day has moved to {new_date}",
    body: para(
      "Hi {contact},",
      "Your photo day for {league} has moved from {old_date} to {new_date}.",
      "Everything you have already sent us stays as it is. Please check that your schedule still works on the new date.",
      "Everything is in one place: {portal_link}",
      "If the new date does not work for your league, reply and we will sort it out.",
      "Thank you,\n{company}",
    ),
  },
  {
    key: "dates.postpone",
    group: "coordinators",
    label: "Photo day postponed",
    when: "When a photo day is postponed with no new date yet.",
    sends: "queue",
    fields: [f.contact, f.league, { name: "old_date", what: "The date it was", sample: "Sat, May 4, 2030" }, f.company],
    subject: "{league}: your photo day on {old_date} is postponed",
    body: para(
      "Hi {contact},",
      "Your photo day for {league} on {old_date} is postponed.",
      "We will be in touch with the new date. Everything you have already sent us stays as it is.",
      "If you have questions, reply to this email.",
      "Thank you,\n{company}",
    ),
  },
  {
    key: "dates.cancel",
    group: "coordinators",
    label: "Photo day cancelled",
    when: "When a photo day is cancelled.",
    sends: "queue",
    fields: [f.contact, f.league, { name: "old_date", what: "The date it was", sample: "Sat, May 4, 2030" }, f.company],
    subject: "{league}: your photo day on {old_date} is cancelled",
    body: para(
      "Hi {contact},",
      "Your photo day for {league} on {old_date} is cancelled.",
      "If you have questions, or would like to pick a new date, reply to this email.",
      "Thank you,\n{company}",
    ),
  },
  {
    key: "delivery.gallery_live",
    group: "coordinators",
    label: "Galleries are live",
    when: "When the office ticks Galleries live on a job. Images can be in the galleries earlier; this is the announcement.",
    sends: "queue",
    fields: [
      f.contact,
      f.league,
      { name: "gallery_link", what: "The league's gallery and shop link, from the job's links", sample: "https://example.com/gallery/river-league", required: true },
      { name: "coupon_note", what: "A sentence with the job's coupon code, when it has one", sample: "Parents can use the code RIVER10 at checkout." },
      { name: "deadline_note", what: "A sentence naming the order deadline, when one is set", sample: "Orders placed by Sun, May 9, 2027 ship with the league order." },
      f.company,
    ],
    subject: "{league}: photos are ready to view and order",
    body: para(
      "Hi {contact},",
      "Photos from {league}'s photo day are live. Please pass this along to your families:",
      "View and order: {gallery_link}",
      "{coupon_note}",
      "{deadline_note}",
      "Parents with questions about an order can reply to this email or write to us, and we will help.",
      "Thank you,\n{company}",
    ),
  },
  {
    key: "delivery.closeout",
    group: "coordinators",
    label: "Season close-out",
    when: "A set number of days after a job is delivered (Settings, closeout.days_after_delivery, 14 unless changed).",
    sends: "queue",
    fields: [
      f.contact,
      f.league,
      { name: "season", what: "The season just photographed", sample: "Spring 2027" },
      { name: "next_season", what: "The next season to book", sample: "Fall 2027" },
      f.company,
    ],
    subject: "{league}: thank you for {season}",
    body: para(
      "Hi {contact},",
      "Thank you for having us photograph {league} this {season}. We hope your families enjoyed their photos.",
      "If there is anything we could have done better on photo day or with orders, we would love to hear it. Just reply to this email.",
      "We are already planning {next_season}. If you know the dates that work for your league, send them over and we will hold one for you.",
      "Thank you,\n{company}",
    ),
  },
  {
    key: "crew.added",
    group: "crew",
    label: "Added to a shift",
    when: "When the office puts a crew member on a shift.",
    sends: "queue",
    fields: [
      { name: "first_name", what: "The crew member's first name, or \"there\"", sample: "Ann" },
      { name: "role", what: "Their position on the shift", sample: "photo attendant" },
      { name: "job", what: "The job's name", sample: "River League" },
      { name: "date", what: "The shift's date", sample: "Sat, Apr 17, 2027" },
      { name: "shift", what: "The date, with the start and end times when they are set", sample: "Sat, Apr 17, 2027, 9:00 AM to 1:00 PM" },
      { name: "place", what: "Where the photo day is", sample: "Main Park, Springfield" },
      { name: "link", what: "Their shifts page", sample: "https://example.com/shifts" },
      f.company,
    ],
    subject: "You're on for {job}, {date}",
    body: para(
      "Hi {first_name},",
      "You're booked as {role} for {job} on {shift}.",
      "Where: {place}",
      "Your shifts are here: {link}",
      "If you can't make it, let the office know as soon as you can.",
      "Thanks,\n{company}",
    ),
  },
  {
    key: "crew.removed",
    group: "crew",
    label: "Taken off a shift",
    when: "When the office takes a crew member off a shift.",
    sends: "queue",
    fields: [
      { name: "first_name", what: "The crew member's first name, or \"there\"", sample: "Ann" },
      { name: "role", what: "Their position on the shift", sample: "photo attendant" },
      { name: "job", what: "The job's name", sample: "River League" },
      { name: "date", what: "The shift's date", sample: "Sat, Apr 17, 2027" },
      { name: "link", what: "Their shifts page", sample: "https://example.com/shifts" },
      f.company,
    ],
    subject: "Change to your shift on {date}",
    body: para(
      "Hi {first_name},",
      "You're no longer booked as {role} for {job} on {date}. Nothing else changes, and you don't need to do anything.",
      "Your shifts are here: {link}",
      "Thanks,\n{company}",
    ),
  },
  {
    key: "makeup.office_alert",
    group: "office",
    label: "Makeup or retake booked or cancelled",
    when: "When a session is booked or cancelled, if Settings, Makeups asks for office emails.",
    sends: "auto",
    fields: [
      f.kind,
      f.Kind,
      { name: "what", what: "\"booked\" or \"cancelled\"", sample: "booked" },
      f.player,
      f.when,
      { name: "facts", what: "The booking's details, one per line", sample: "Player: Ben Example\nLeague: River League\nTeam: U10 Blue\nParent: Dana Example" },
      listLink,
    ],
    subject: "{Kind} {what}: {player}, {when}",
    body: para("A {kind} session was {what} for {when}.", "{facts}", "Bookings and photo slips:\n{link}"),
  },
  {
    key: "makeup.office_digest",
    group: "office",
    label: "Today's makeups and retakes",
    when: "Each morning there are sessions, if Settings, Makeups asks for office emails.",
    sends: "auto",
    fields: [
      { name: "count", what: "How many sessions, in words", sample: "2 makeup or retake sessions" },
      { name: "date", what: "Today's date", sample: "Mon, Mar 1, 2027" },
      { name: "sessions", what: "The day's sessions, one per line", sample: "10:20 AM  Ben Example (Makeup), River League, U10 Blue\n10:30 AM  Lee Example (Retake)" },
      listLink,
    ],
    subject: "{count} today, {date}",
    body: para("On the list for today:", "{sessions}", "Bookings and photo slips:\n{link}"),
  },
];

const BY_KEY = new Map(MESSAGES.map((m) => [m.key, m]));

export function messageDef(key: string): MessageDef | null {
  return BY_KEY.get(key) ?? null;
}

/** The settings row that holds a company's wording for a message. */
export function settingKeyOf(def: MessageDef) {
  return def.settingKey ?? `message.${def.key}`;
}

export const MESSAGE_SETTING_KEYS = MESSAGES.map(settingKeyOf);

export const SUBJECT_MAX = 300;
export const BODY_MAX = 10000;

/** The company's wording when it has saved one, else the starting text, part by part. */
export function readTemplate(def: MessageDef, value: unknown): Template & { edited: boolean } {
  const v = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const text = (x: unknown, max: number) => (typeof x === "string" && x.trim() && x.length <= max ? x : null);
  const subject = text(v.subject, SUBJECT_MAX) ?? def.subject;
  const body = text(v.body, BODY_MAX) ?? def.body;
  return { subject, body, edited: subject !== def.subject || body !== def.body };
}

const FIELD = /\{([A-Za-z_]+)\}/g;

/** The fill-in fields a piece of wording uses, in order, once each. */
export function fieldsIn(text: string): string[] {
  return [...new Set([...text.matchAll(FIELD)].map((m) => m[1]))];
}

/**
 * Fill a body. Each paragraph (blank line between) is filled on its own, and
 * a paragraph whose fields are all empty is left out, so "Where: {place}"
 * vanishes when there is no place. A name that is not a field stays as typed.
 */
export function fillBody(text: string, words: Record<string, string>): string {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => {
      const used = fieldsIn(p).filter((name) => name in words);
      if (used.length && used.every((name) => !words[name].trim())) return "";
      return p.replace(FIELD, (all, name: string) => (name in words ? words[name] : all)).trim();
    })
    .filter(Boolean)
    .join("\n\n");
}

/** Fill a subject: one line, no more than 300 characters. */
export function fillSubject(text: string, words: Record<string, string>): string {
  return text
    .replace(FIELD, (all, name: string) => (name in words ? words[name] : all))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SUBJECT_MAX);
}

export function fillTemplate(template: Template, words: Record<string, string>): Template {
  return { subject: fillSubject(template.subject, words), body: fillBody(template.body, words) };
}

/** Write a message: the company's saved wording when there is one, filled with the facts. */
export function renderMessage(key: string, words: Record<string, string>, saved?: SavedMessages | null): Template {
  const def = BY_KEY.get(key);
  if (!def) throw new Error(`unknown message: ${key}`);
  return fillTemplate(readTemplate(def, saved?.[settingKeyOf(def)]), words);
}

export function sampleWords(def: MessageDef): Record<string, string> {
  return Object.fromEntries(def.fields.map((x) => [x.name, x.sample]));
}

/** Why wording cannot be saved, or null. Typos in field names are the usual cause. */
export function templateProblem(def: MessageDef, subject: string, body: string): string | null {
  if (!subject.trim()) return "Write a subject.";
  if (!body.trim()) return "Write the message.";
  if (subject.length > SUBJECT_MAX) return `The subject can be up to ${SUBJECT_MAX} characters.`;
  if (body.length > BODY_MAX) return `The message can be up to ${BODY_MAX.toLocaleString("en-US")} characters.`;
  if (/[\r\n]/.test(subject.trim())) return "The subject must be one line.";
  const known = new Set(def.fields.map((x) => x.name));
  const unknown = fieldsIn(subject + "\n" + body).filter((name) => !known.has(name));
  if (unknown.length) return `This message has no field called {${unknown[0]}}. Check the list of fields.`;
  const missing = def.fields.filter((x) => x.required && !fieldsIn(body).includes(x.name));
  if (missing.length) return `Keep {${missing[0].name}} in the message: ${missing[0].what.charAt(0).toLowerCase()}${missing[0].what.slice(1)}.`;
  return null;
}
