// Reads the schedule form on the Settings page. No network.

import { isDate, isTime, WEEKDAYS, type Blackout, type Hours, type Schedule } from "./schedule";

type Input = Record<string, string | undefined>;
export type FormResult<T> = { ok: true; value: T } | { ok: false; message: string };

function whole(input: Input, key: string, label: string, min: number, max: number): number | string {
  const raw = (input[key] ?? "").trim();
  const n = Number(raw);
  if (!/^\d{1,4}$/.test(raw) || n < min || n > max) return `${label} must be a whole number from ${min} to ${max}.`;
  return n;
}

/** The whole schedule except the blackout dates, which have their own small forms. */
export function parseScheduleForm(input: Input, current: Schedule): FormResult<Schedule> {
  const numbers = {
    slotMinutes: whole(input, "slotMinutes", "Session length", 5, 120),
    perSlot: whole(input, "perSlot", "Bookings per time", 1, 20),
    leadHours: whole(input, "leadHours", "Booking notice", 0, 336),
    daysAhead: whole(input, "daysAhead", "How far ahead", 1, 180),
  };
  for (const v of Object.values(numbers)) if (typeof v === "string") return { ok: false, message: v };

  const hours: Hours[][] = [];
  for (let day = 0; day < 7; day++) {
    const list: Hours[] = [];
    for (const n of ["", "2"]) {
      const from = (input[`d${day}_from${n}`] ?? "").trim();
      const to = (input[`d${day}_to${n}`] ?? "").trim();
      if (!from && !to) continue;
      if (!isTime(from) || !isTime(to)) return { ok: false, message: `${WEEKDAYS[day]} needs both an opening and a closing time.` };
      if (from >= to) return { ok: false, message: `${WEEKDAYS[day]} closes before it opens.` };
      list.push({ from, to });
    }
    list.sort((a, b) => a.from.localeCompare(b.from));
    if (list.length === 2 && list[1].from < list[0].to) return { ok: false, message: `${WEEKDAYS[day]}'s two sets of hours overlap.` };
    hours.push(list);
  }
  const open = input.open === "on";
  if (open && hours.every((h) => h.length === 0)) return { ok: false, message: "Set the hours for at least one day before opening the page." };

  const place = (input.place ?? "").trim();
  const details = (input.details ?? "").trim();
  if (place.length > 300) return { ok: false, message: "The place holds up to 300 characters." };
  if (details.length > 2000) return { ok: false, message: "The details hold up to 2,000 characters." };

  return {
    ok: true,
    value: {
      ...current,
      open,
      slotMinutes: numbers.slotMinutes as number,
      perSlot: numbers.perSlot as number,
      leadHours: numbers.leadHours as number,
      daysAhead: numbers.daysAhead as number,
      hours,
      place,
      details,
      emailStaff: input.emailStaff === "on",
      emailParent: input.emailParent === "on",
    },
  };
}

/** One blackout: a day, or a first and last day, with an optional reason. */
export function parseBlackout(input: Input, current: Blackout[]): FormResult<Blackout[]> {
  const from = (input.from ?? "").trim();
  const to = (input.to ?? "").trim() || from;
  const note = (input.note ?? "").trim().slice(0, 120) || null;
  if (!isDate(from) || !isDate(to)) return { ok: false, message: "Pick the date to close." };
  if (to < from) return { ok: false, message: "The last day cannot come before the first." };
  if (current.length >= 200) return { ok: false, message: "Remove an old blackout date first." };
  if (current.some((b) => b.from === from && b.to === to)) return { ok: false, message: "Those dates are already closed." };
  return { ok: true, value: [...current, { from, to, note }].sort((a, b) => a.from.localeCompare(b.from)) };
}
