import { describe, expect, it } from "vitest";
import { monthGrid, monthLabel, monthOf, shiftMonth } from "@/lib/calendar";

describe("calendar", () => {
  it("covers a month in whole weeks from Sunday", () => {
    const g = monthGrid("2027-04"); // April 1, 2027 is a Thursday
    expect(g.from).toBe("2027-03-28");
    expect(g.to).toBe("2027-05-01");
    expect(g.weeks).toHaveLength(5);
    expect(g.weeks.every((w) => w.length === 7)).toBe(true);
    expect(g.weeks.flat().filter((c) => c.inMonth)).toHaveLength(30);
  });
  it("handles a month that starts on Sunday and a leap February", () => {
    expect(monthGrid("2026-11").from).toBe("2026-11-01");
    expect(monthGrid("2028-02").weeks.flat().filter((c) => c.inMonth)).toHaveLength(29);
  });
  it("steps across a year", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
  });
  it("falls back to this month on anything odd", () => {
    expect(monthOf("2027-13", "2026-11-19")).toBe("2026-11");
    expect(monthOf(undefined, "2026-11-19")).toBe("2026-11");
    expect(monthOf("2027-04", "2026-11-19")).toBe("2027-04");
  });
  it("labels a month", () => {
    expect(monthLabel("2027-04")).toBe("April 2027");
  });
});
