import { describe, expect, it } from "vitest";
import { seasonForDate, seasonSortKey } from "@/lib/season";

describe("seasonForDate", () => {
  it("matches the database season_label rules", () => {
    expect(seasonForDate("2027-03-01")).toBe("Spring 2027");
    expect(seasonForDate("2027-05-31")).toBe("Spring 2027");
    expect(seasonForDate("2027-06-01")).toBe("Summer 2027");
    expect(seasonForDate("2027-09-15")).toBe("Fall 2027");
    expect(seasonForDate("2027-01-10")).toBe("Winter 2027");
    expect(seasonForDate("2026-12-05")).toBe("Winter 2027");
    expect(seasonForDate("2026-02-28")).toBe("Winter 2026");
    expect(seasonForDate(null)).toBeNull();
  });
  it("sorts seasons in calendar order", () => {
    const list = ["Fall 2026", "Spring 2027", "Winter 2027", "Summer 2026"];
    expect([...list].sort((a, b) => seasonSortKey(a) - seasonSortKey(b))).toEqual([
      "Summer 2026",
      "Fall 2026",
      "Winter 2027",
      "Spring 2027",
    ]);
  });
});
