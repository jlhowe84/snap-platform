import { describe, expect, it } from "vitest";
import { daysBetween, formatDate, formatTime, todayIn } from "@/lib/dates";

describe("dates", () => {
  it("never shifts a calendar date", () => {
    expect(formatDate("2027-04-11")).toBe("Apr 11, 2027");
  });
  it("formats times", () => {
    expect(formatTime("09:00:00")).toBe("9:00 AM");
    expect(formatTime("13:30:00")).toBe("1:30 PM");
    expect(formatTime("00:15:00")).toBe("12:15 AM");
    expect(formatTime(null)).toBeNull();
  });
  it("uses the company time zone for today", () => {
    // 03:00 UTC on Nov 18 is still Nov 17 in New York.
    expect(todayIn("America/New_York", new Date("2026-11-18T03:00:00Z"))).toBe("2026-11-17");
  });
  it("counts days", () => {
    expect(daysBetween("2027-02-27", "2027-03-01")).toBe(2);
  });
});
