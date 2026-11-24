import { describe, expect, it } from "vitest";
import { findSubject } from "@/lib/makeups/captura";
import { parseBlackout, parseScheduleForm } from "@/lib/makeups/form";
import { officeAlert, officeDigest, parentConfirmation } from "@/lib/makeups/messages";
import {
  bookingProblem,
  canCancel,
  CLOSED_SCHEDULE,
  minutesBetween,
  openDays,
  readSchedule,
  slotsOn,
  wallClock,
  type Schedule,
} from "@/lib/makeups/schedule";

// Monday to Thursday 10:00 to 16:30, ten-minute sessions, one family each.
const week: Schedule = {
  ...CLOSED_SCHEDULE,
  open: true,
  hours: [[], [{ from: "10:00", to: "16:30" }], [{ from: "10:00", to: "16:30" }], [{ from: "10:00", to: "16:30" }], [{ from: "10:00", to: "16:30" }], [], []],
};
// 2027-03-01 is a Monday.
const sundayNight = { date: "2027-02-28", time: "20:00" };

describe("makeup schedule", () => {
  it("reads a missing or broken setting as closed", () => {
    expect(readSchedule(null)).toEqual(CLOSED_SCHEDULE);
    expect(readSchedule({ open: true, slotMinutes: 3, hours: "x", blackouts: [{ from: "2027-13-01", to: "2027-13-02" }] })).toEqual({ ...CLOSED_SCHEDULE, open: true });
  });

  it("keeps what was saved", () => {
    expect(readSchedule(JSON.parse(JSON.stringify(week)))).toEqual(week);
  });

  it("gives six sessions an hour", () => {
    const slots = slotsOn(week, "2027-03-01");
    expect(slots.slice(0, 7)).toEqual(["10:00", "10:10", "10:20", "10:30", "10:40", "10:50", "11:00"]);
    expect(slots.at(-1)).toBe("16:20");
    expect(slots).toHaveLength(39);
  });

  it("has no times on a closed weekday or a blackout date", () => {
    expect(slotsOn(week, "2027-03-05")).toEqual([]);
    const closed = { ...week, blackouts: [{ from: "2027-03-01", to: "2027-03-02", note: "Away" }] };
    expect(slotsOn(closed, "2027-03-01")).toEqual([]);
    expect(slotsOn(closed, "2027-03-02")).toEqual([]);
    expect(slotsOn(closed, "2027-03-03")).toHaveLength(39);
  });

  it("splits a day that closes for lunch", () => {
    const lunch = { ...week, hours: week.hours.map((h, d) => (d === 1 ? [{ from: "10:00", to: "10:30" }, { from: "13:00", to: "13:20" }] : h)) };
    expect(slotsOn(lunch, "2027-03-01")).toEqual(["10:00", "10:10", "10:20", "13:00", "13:10"]);
  });

  it("offers only times at least twelve hours away", () => {
    const days = openDays(week, sundayNight);
    expect(days[0].date).toBe("2027-03-01");
    expect(days[0].slots[0].time).toBe("10:00");
    const late = openDays(week, { date: "2027-02-28", time: "23:30" });
    expect(late[0].slots[0].time).toBe("11:30");
  });

  it("leaves out full times and full days", () => {
    const taken = Object.fromEntries(slotsOn(week, "2027-03-01").map((t) => [`2027-03-01 ${t}`, 1]));
    expect(openDays(week, sundayNight, taken)[0].date).toBe("2027-03-02");
    delete taken["2027-03-01 12:00"];
    expect(openDays(week, sundayNight, taken)[0].slots).toEqual([{ time: "12:00", left: 1 }]);
    expect(openDays({ ...week, perSlot: 2 }, sundayNight, taken)[0].slots).toHaveLength(39);
  });

  it("offers nothing while closed", () => {
    expect(openDays({ ...week, open: false }, sundayNight)).toEqual([]);
  });

  it("refuses a time that is not bookable", () => {
    expect(bookingProblem(week, { date: "2027-03-01", time: "10:00" }, sundayNight)).toBeNull();
    expect(bookingProblem(week, { date: "2027-03-01", time: "10:05" }, sundayNight)).toMatch(/not open/);
    expect(bookingProblem(week, { date: "2027-03-01", time: "17:00" }, sundayNight)).toMatch(/not open/);
    expect(bookingProblem(week, { date: "2027-03-01", time: "10:00" }, { date: "2027-02-28", time: "22:01" })).toMatch(/12 hours/);
    expect(bookingProblem(week, { date: "2027-09-01", time: "10:00" }, sundayNight)).toMatch(/too far/);
    expect(bookingProblem({ ...week, open: false }, { date: "2027-03-01", time: "10:00" }, sundayNight)).toMatch(/closed/);
    expect(bookingProblem(week, { date: "soon", time: "10:00" }, sundayNight)).toMatch(/Pick a date/);
  });

  it("lets a parent cancel until the session starts", () => {
    expect(canCancel({ date: "2027-03-01", time: "10:00" }, { date: "2027-03-01", time: "09:59" })).toBe(true);
    expect(canCancel({ date: "2027-03-01", time: "10:00" }, { date: "2027-03-01", time: "10:00" })).toBe(false);
  });

  it("reads the wall clock in the company's time zone", () => {
    expect(wallClock("America/New_York", new Date("2027-03-01T04:30:00Z"))).toEqual({ date: "2027-02-28", time: "23:30" });
    expect(minutesBetween({ date: "2027-02-28", time: "23:30" }, { date: "2027-03-01", time: "00:10" })).toBe(40);
  });
});

describe("schedule form", () => {
  const base = { slotMinutes: "10", perSlot: "1", leadHours: "12", daysAhead: "30", open: "on", d1_from: "10:00", d1_to: "16:30", place: " The studio ", emailStaff: "on" };

  it("reads the form and keeps the blackout dates", () => {
    const current = { ...CLOSED_SCHEDULE, blackouts: [{ from: "2027-03-01", to: "2027-03-01", note: null }] };
    const r = parseScheduleForm(base, current);
    expect(r.ok && r.value).toMatchObject({ open: true, place: "The studio", emailStaff: true, emailParent: false, blackouts: current.blackouts });
    expect(r.ok && r.value.hours[1]).toEqual([{ from: "10:00", to: "16:30" }]);
    expect(r.ok && r.value.hours[0]).toEqual([]);
  });

  it("refuses hours that make no sense", () => {
    expect(parseScheduleForm({ ...base, d1_to: "" }, CLOSED_SCHEDULE)).toMatchObject({ ok: false, message: expect.stringMatching(/Monday needs both/) });
    expect(parseScheduleForm({ ...base, d1_to: "09:00" }, CLOSED_SCHEDULE)).toMatchObject({ ok: false, message: expect.stringMatching(/closes before/) });
    expect(parseScheduleForm({ ...base, d1_from2: "16:00", d1_to2: "18:00" }, CLOSED_SCHEDULE)).toMatchObject({ ok: false, message: expect.stringMatching(/overlap/) });
    expect(parseScheduleForm({ ...base, slotMinutes: "2" }, CLOSED_SCHEDULE)).toMatchObject({ ok: false });
    expect(parseScheduleForm({ ...base, d1_from: "", d1_to: "" }, CLOSED_SCHEDULE)).toMatchObject({ ok: false, message: expect.stringMatching(/at least one day/) });
  });

  it("adds a blackout day or run of days", () => {
    const one = parseBlackout({ from: "2027-03-10", note: "Holiday" }, []);
    expect(one).toEqual({ ok: true, value: [{ from: "2027-03-10", to: "2027-03-10", note: "Holiday" }] });
    expect(parseBlackout({ from: "2027-03-10", to: "2027-03-08" }, [])).toMatchObject({ ok: false });
    expect(parseBlackout({ from: "2027-03-10" }, one.ok ? one.value : [])).toMatchObject({ ok: false, message: expect.stringMatching(/already/) });
    expect(parseBlackout({ from: "" }, [])).toMatchObject({ ok: false });
  });
});

describe("makeup messages", () => {
  const b = { kind: "makeup" as const, player: "Sam Example", league: "Example League", team: "U10 Blue", date: "2027-03-01", time: "10:20", parentName: "Pat Example", email: "pat@example.com", phone: null, orderNumber: 123, note: null };

  it("tells the parent when, where and how to cancel", () => {
    const m = parentConfirmation(b, { company: "Photo Co", place: "1 Main St", details: "", manageUrl: "https://example.com/x" });
    expect(m.subject).toBe("Makeup session booked for Sam Example: Mon, Mar 1, 2027 at 10:20 AM");
    expect(m.body).toContain("Hi Pat,");
    expect(m.body).toContain("Where: 1 Main St");
    expect(m.body).toContain("https://example.com/x");
    expect(m.body).not.toContain("—");
  });

  it("tells the office who booked or cancelled", () => {
    const m = officeAlert(b, "cancelled", "https://example.com/list");
    expect(m.subject).toBe("Makeup cancelled: Sam Example, Mon, Mar 1, 2027 at 10:20 AM");
    expect(m.body).toContain("Order: 123");
    expect(m.body).not.toContain("Phone:");
  });

  it("lists the day's sessions in the morning", () => {
    const m = officeDigest("2027-03-01", [b, { ...b, kind: "retake", player: "Lee Example", team: null, league: null, time: "10:30" }], "https://example.com/list");
    expect(m.subject).toBe("2 makeup or retake sessions today, Mon, Mar 1, 2027");
    expect(m.body).toContain("10:20 AM  Sam Example (Makeup), Example League, U10 Blue");
    expect(m.body).toContain("10:30 AM  Lee Example (Retake)");
  });
});

describe("finding the player for a slip", () => {
  const gallery = {
    groups: [{ id: 7, name: "U10 Blue" }],
    subjects: [
      { id: 1001, subjectID: "r-1", firstName: "Sam", lastName: "Example", onlineCode: 2097187722, galleryGroups: [7] },
      { id: 1002, firstName: "Sam", lastName: "Other", onlineCode: "1933720248", galleryGroups: [{ id: 7 }] },
      { id: 1003, firstName: "Lee", lastName: "Twin", onlineCode: "1" },
      { id: 1004, firstName: "Lee", lastName: "Twin", onlineCode: "2" },
    ],
  };

  it("uses the order's own player", () => {
    expect(findSubject(gallery, { subjectIds: ["1002"], name: "Sam Example" })).toEqual({ found: { name: "Sam Other", team: "U10 Blue", onlineCode: "1933720248" } });
    expect(findSubject(gallery, { subjectIds: ["r-1"] })).toMatchObject({ found: { onlineCode: "2097187722" } });
  });

  it("falls back to a name that matches one player", () => {
    expect(findSubject(gallery, { name: "sam example" })).toMatchObject({ found: { name: "Sam Example", team: "U10 Blue" } });
    expect(findSubject(gallery, { subjectIds: ["9999"], name: "Sam Example" })).toMatchObject({ found: { name: "Sam Example" } });
  });

  it("never guesses between namesakes or from one word", () => {
    expect(findSubject(gallery, { name: "Lee Twin" })).toEqual({ found: null, why: "several" });
    expect(findSubject(gallery, { name: "Sam" })).toEqual({ found: null, why: "none" });
    expect(findSubject(gallery, { name: "Nobody Here" })).toEqual({ found: null, why: "none" });
    expect(findSubject(null, { name: "Sam Example" })).toEqual({ found: null, why: "none" });
  });
});
