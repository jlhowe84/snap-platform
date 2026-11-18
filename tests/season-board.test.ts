import { describe, expect, it } from "vitest";
import { equivalentDate, isSeasonLabel, outreachSeason, seasonForDate, seasonRange, shiftSeason } from "@/lib/season";

describe("season helpers for the board", () => {
  it("shifts seasons across years both ways", () => {
    expect(shiftSeason("Fall 2026", 2)).toBe("Spring 2027");
    expect(shiftSeason("Winter 2027", -1)).toBe("Fall 2026");
    expect(shiftSeason("Spring 2027", 4)).toBe("Spring 2028");
  });

  it("targets the season whose offers go out now", () => {
    expect(outreachSeason("2026-11-18")).toBe("Spring 2027");
    expect(outreachSeason("2027-01-10")).toBe("Summer 2027");
    expect(outreachSeason("2027-04-01")).toBe("Fall 2027");
    expect(outreachSeason("2027-07-15")).toBe("Winter 2028");
  });

  it("gives each season's date range, with December in the next year's winter", () => {
    expect(seasonRange("Winter 2028")).toEqual({ start: "2027-12-01", end: "2028-02-29" });
    expect(seasonRange("Spring 2027")).toEqual({ start: "2027-03-01", end: "2027-05-31" });
    for (const label of ["Winter 2027", "Spring 2027", "Summer 2027", "Fall 2027"]) {
      const { start, end } = seasonRange(label);
      expect(seasonForDate(start)).toBe(label);
      expect(seasonForDate(end)).toBe(label);
    }
  });

  it("moves last year's date to the same weekday", () => {
    const next = equivalentDate("2026-04-18"); // a Saturday
    expect(next).toBe("2027-04-17");
    expect(new Date(`${next}T00:00:00Z`).getUTCDay()).toBe(6);
  });

  it("checks labels", () => {
    expect(isSeasonLabel("Spring 2027")).toBe(true);
    expect(isSeasonLabel("spring 2027")).toBe(false);
  });
});
