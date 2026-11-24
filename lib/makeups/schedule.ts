// The makeup and retake schedule: when the studio is open for bookings and
// which times are still free. No network and no database here. Dates are
// calendar dates ("YYYY-MM-DD") and times are wall-clock times ("HH:MM") in
// the company's time zone, the same way photo days are kept.
//
// The schedule is one company setting (makeup.schedule). A company with no
// setting is closed: open days, hours and the place are the company's own
// facts and never live in code.

export const MAKEUP_SETTING = "makeup.schedule";

export type Hours = { from: string; to: string };
export type Blackout = { from: string; to: string; note: string | null };

export type Schedule = {
  /** The public page takes bookings only while this is true. */
  open: boolean;
  slotMinutes: number;
  /** How many bookings one time can hold. */
  perSlot: number;
  /** A time can be booked until this many hours before it starts. */
  leadHours: number;
  /** How far ahead the page offers dates. */
  daysAhead: number;
  /** Open hours for each weekday, Sunday first. An empty list is a closed day. */
  hours: Hours[][];
  blackouts: Blackout[];
  /** Where to come, shown to the parent. */
  place: string;
  /** What to bring or know, shown to the parent. */
  details: string;
  emailStaff: boolean;
  emailParent: boolean;
  /** Email the parent a reminder the day before their session. */
  remindParent: boolean;
};

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export const CLOSED_SCHEDULE: Schedule = {
  open: false,
  slotMinutes: 10,
  perSlot: 1,
  leadHours: 12,
  daysAhead: 30,
  hours: [[], [], [], [], [], [], []],
  blackouts: [],
  place: "",
  details: "",
  emailStaff: true,
  emailParent: true,
  remindParent: true,
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isTime = (v: unknown): v is string => typeof v === "string" && TIME.test(v);
export const isDate = (v: unknown): v is string =>
  typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const timeOf = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const whole = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : fallback;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** The saved schedule, with anything missing or malformed read as closed. */
export function readSchedule(value: unknown): Schedule {
  const v = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const rawHours = Array.isArray(v.hours) ? v.hours : [];
  const hours = CLOSED_SCHEDULE.hours.map((_, day) => {
    const list = Array.isArray(rawHours[day]) ? (rawHours[day] as unknown[]) : [];
    return list
      .map((h) => (h && typeof h === "object" ? (h as Record<string, unknown>) : {}))
      .filter((h): h is Hours => isTime(h.from) && isTime(h.to) && h.from < h.to)
      .map((h) => ({ from: h.from, to: h.to }))
      .sort((a, b) => a.from.localeCompare(b.from))
      .slice(0, 2);
  });
  const blackouts = (Array.isArray(v.blackouts) ? v.blackouts : [])
    .map((b) => (b && typeof b === "object" ? (b as Record<string, unknown>) : {}))
    .filter((b) => isDate(b.from) && isDate(b.to) && (b.from as string) <= (b.to as string))
    .map((b) => ({ from: b.from as string, to: b.to as string, note: text(b.note, 120) || null }))
    .sort((a, b) => a.from.localeCompare(b.from))
    .slice(0, 200);
  return {
    open: v.open === true,
    slotMinutes: whole(v.slotMinutes, 5, 120, CLOSED_SCHEDULE.slotMinutes),
    perSlot: whole(v.perSlot, 1, 20, CLOSED_SCHEDULE.perSlot),
    leadHours: whole(v.leadHours, 0, 336, CLOSED_SCHEDULE.leadHours),
    daysAhead: whole(v.daysAhead, 1, 180, CLOSED_SCHEDULE.daysAhead),
    hours,
    blackouts,
    place: text(v.place, 300),
    details: text(v.details, 2000),
    emailStaff: v.emailStaff !== false,
    emailParent: v.emailParent !== false,
    remindParent: v.remindParent !== false,
  };
}

export function weekdayOf(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function addDays(date: string, by: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

export function blackoutOn(s: Schedule, date: string): Blackout | null {
  return s.blackouts.find((b) => b.from <= date && date <= b.to) ?? null;
}

/** Every start time on a date, before any booking is counted. Blackout dates have none. */
export function slotsOn(s: Schedule, date: string): string[] {
  if (!isDate(date) || blackoutOn(s, date)) return [];
  const out: string[] = [];
  for (const h of s.hours[weekdayOf(date)] ?? []) {
    for (let m = minutesOf(h.from); m + s.slotMinutes <= minutesOf(h.to); m += s.slotMinutes) {
      const t = timeOf(m);
      if (!out.includes(t)) out.push(t);
    }
  }
  return out.sort();
}

export type WallClock = { date: string; time: string };

/** The date and time on the wall in a time zone. */
export function wallClock(timeZone: string, now: Date = new Date()): WallClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** Minutes from one wall-clock moment to another (negative when the second is earlier). */
export function minutesBetween(a: WallClock, b: WallClock) {
  const at = (w: WallClock) => Date.parse(`${w.date}T${w.time}:00Z`) / 60_000;
  return Math.round(at(b) - at(a));
}

/** True once it is too late to book a time: the lead time has passed. */
export function tooLate(s: Schedule, slot: WallClock, now: WallClock) {
  return minutesBetween(now, slot) < s.leadHours * 60;
}

export type Taken = Record<string, number>;
export const slotKey = (date: string, time: string) => `${date} ${time.slice(0, 5)}`;

export type OpenDay = { date: string; slots: { time: string; left: number }[] };

/** The dates a parent can still book, each with its free times. */
export function openDays(s: Schedule, now: WallClock, taken: Taken = {}): OpenDay[] {
  if (!s.open) return [];
  const days: OpenDay[] = [];
  for (let i = 0; i <= s.daysAhead; i++) {
    const date = addDays(now.date, i);
    const slots = slotsOn(s, date)
      .filter((time) => !tooLate(s, { date, time }, now))
      .map((time) => ({ time, left: s.perSlot - (taken[slotKey(date, time)] ?? 0) }))
      .filter((slot) => slot.left > 0);
    if (slots.length) days.push({ date, slots });
  }
  return days;
}

/** Why a parent cannot book this time, or null when they can. Seats are checked by the database. */
export function bookingProblem(s: Schedule, slot: WallClock, now: WallClock): string | null {
  if (!s.open) return "Online booking is closed right now.";
  if (!isDate(slot.date) || !isTime(slot.time)) return "Pick a date and a time.";
  if (minutesBetween(now, slot) > (s.daysAhead + 1) * 1440) return "That date is too far ahead to book yet.";
  if (!slotsOn(s, slot.date).includes(slot.time)) return "That time is not open. Pick another.";
  if (tooLate(s, slot, now)) {
    return s.leadHours > 0 ? `That time is less than ${s.leadHours} hours away. Pick a later one.` : "That time has passed. Pick a later one.";
  }
  return null;
}

/** A parent may cancel until the booking starts. */
export function canCancel(slot: WallClock, now: WallClock) {
  return minutesBetween(now, slot) > 0;
}

export const KINDS = ["makeup", "retake"] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_LABEL: Record<Kind, string> = { makeup: "Makeup", retake: "Retake" };

export const BOOKING_STATUSES = ["booked", "done", "no_show", "cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  booked: "Booked",
  done: "Photographed",
  no_show: "Did not come",
  cancelled: "Cancelled",
};

/** The follow-up boxes on a booking and on its photo slip, in the order the work happens. */
export const FOLLOW_UP = [
  { key: "imported", label: "Imported" },
  { key: "uploaded", label: "Uploaded" },
  { key: "added_to_team", label: "Added to team" },
  { key: "email_sent", label: "Email sent" },
  { key: "lab_sent", label: "Order sent to lab" },
] as const;
export type FollowUpKey = (typeof FOLLOW_UP)[number]["key"];
