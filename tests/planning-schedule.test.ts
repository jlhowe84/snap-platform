import { describe, expect, it } from "vitest";
import { buildDraft } from "@/lib/clock/drafts";
import { planningDates } from "@/lib/planning/dates";
import { answerRows, PlanningAnswers, readAnswers, stillToCome } from "@/lib/planning/form";
import { rosterMime } from "@/lib/rosters/types";
import { nextFree, placeRemaining, scheduleCsv, toClock, toMinutes, type Slot } from "@/lib/schedule/layout";

describe("planning form", () => {
  it("drops blank answers and reads numbers", () => {
    const a = PlanningAnswers.parse({ venue: "  ", team_count: "12", athlete_count: "", setup: "indoors", first_group_time: "" });
    expect(a).toEqual({ team_count: 12, setup: "indoors" });
  });

  it("refuses answers outside the choices", () => {
    expect(PlanningAnswers.safeParse({ setup: "on the moon" }).success).toBe(false);
    expect(PlanningAnswers.safeParse({ team_count: "-3" }).success).toBe(false);
    expect(readAnswers({ setup: "on the moon" })).toEqual({});
  });

  it("says what is still to come", () => {
    expect(stillToCome({})).toContain("place");
    const full = { first_group_time: "09:00", setup: "outdoors", venue: "Field 1", team_count: 8, athlete_count: 90, delivery: "home" } as const;
    expect(stillToCome(full)).toEqual([]);
    expect(stillToCome({ ...full, delivery: "club" })).toEqual(["delivery address"]);
    expect(answerRows(full).map((r) => r.label)).toContain("Delivery");
  });
});

describe("planning dates", () => {
  it("asks three weeks out and stops at ten days", () => {
    expect(planningDates("2027-04-17")).toEqual({ askBy: "2027-03-27", deadline: "2027-04-07" });
    expect(planningDates(null)).toEqual({ askBy: null, deadline: null });
  });

  it("names the last day in the at-risk note", () => {
    const d = buildDraft("chase.at_risk", {
      companyName: "Test Co", leagueName: "Test League", contactFirstName: "Pat", to: ["pat@test.invalid"],
      photoDay: "2027-04-17", missing: ["roster"], deadlineOn: "2027-04-07",
    });
    expect(d.body).toContain("Wed, Apr 7, 2027");
    expect(d.body).not.toMatch(/[—–]/);
  });
});

describe("roster files", () => {
  it("decides the type from the extension", () => {
    expect(rosterMime("Spring Roster.XLSX")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(rosterMime("photo.jpeg")).toBe("image/jpeg");
    expect(rosterMime("roster.exe")).toBeNull();
    expect(rosterMime("roster")).toBeNull();
  });
});

describe("scheduler", () => {
  const slot = (station: number, starts_at: string, minutes: number, team_id: string | null = null): Slot => ({
    station, starts_at, minutes, kind: team_id ? "team" : "break", team_id, label: team_id ? null : "Lunch",
  });

  it("does clock math", () => {
    expect(toMinutes("09:15:00")).toBe(555);
    expect(toClock(555)).toBe("09:15");
  });

  it("finds when each station is free", () => {
    expect(nextFree([slot(1, "09:00", 15, "a"), slot(1, "09:30", 20, "b")], 2, "09:00")).toEqual([590, 540]);
  });

  it("places only the teams without a slot, on the station free soonest", () => {
    const existing = [slot(1, "09:00", 15, "a")];
    const added = placeRemaining(["a", "b", "c", "d"], existing, { stations: 2, start: "09:00", block: 15 });
    expect(added.map((s) => [s.team_id, s.station, s.starts_at])).toEqual([
      ["b", 2, "09:00"],
      ["c", 1, "09:15"],
      ["d", 2, "09:15"],
    ]);
    expect(placeRemaining(["a"], existing, { stations: 2, start: "09:00", block: 15 })).toEqual([]);
  });

  it("exports in time order and defuses spreadsheet formulas", () => {
    const csv = scheduleCsv(
      [slot(2, "09:15", 15, "b"), slot(1, "09:00", 15, "a"), slot(1, "09:15", 30)],
      [
        { id: "a", name: "=SUM(A1)", division: "U10", coach_name: "Lee, Pat", tc_number: "101" },
        { id: "b", name: "Tigers", division: null, coach_name: null, tc_number: null },
      ],
      "2027-04-17",
    );
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("Date,Start,End,Station,Team,Division,Coach,TC");
    expect(lines[1]).toBe(`2027-04-17,09:00,09:15,1,'=SUM(A1),U10,"Lee, Pat",101`);
    expect(lines[2]).toBe("2027-04-17,09:15,09:45,1,Lunch,,,");
    expect(lines[3]).toBe("2027-04-17,09:15,09:30,2,Tigers,,,");
  });
});
