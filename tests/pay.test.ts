import { describe, expect, it } from "vitest";
import { defaultPeriod, payCsv, payTotals, type PayLine } from "@/lib/staffing/pay";

const line = (over: Partial<PayLine>): PayLine => ({
  crew_member_id: "a",
  full_name: "Ann",
  work_date: "2027-04-17",
  position: "photographer",
  description: "League A",
  rate: 100,
  unit: "shift",
  hours: null,
  base: 100,
  miles: 0,
  mileage: 0,
  adjustment: 0,
  total: 100,
  status: "pending",
  note: null,
  ...over,
});

describe("payTotals", () => {
  it("adds up per person to the cent, highest first", () => {
    const totals = payTotals([
      line({ base: 0.1, total: 0.1 }),
      line({ base: 0.2, total: 0.2 }),
      line({ crew_member_id: "b", full_name: "Bo", base: 80, miles: 12.5, mileage: 7.25, adjustment: -5, total: 82.25, rate: null }),
    ]);
    expect(totals[0]).toMatchObject({ full_name: "Bo", total: 82.25, miles: 12.5, unpriced: 1 });
    expect(totals[1]).toMatchObject({ full_name: "Ann", lines: 2, base: 0.3, total: 0.3 });
  });
});

describe("payCsv", () => {
  it("writes lines then totals, quoting and defusing formulas", () => {
    const csv = payCsv([line({ description: '=HYPERLINK("x")', note: "late, 10 min" }), line({ adjustment: -5, total: 95 })]);
    const rows = csv.trim().split("\r\n");
    expect(rows[0]).toMatch(/^Name,Date,Job/);
    expect(rows[1]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(rows[1]).toContain('"late, 10 min"');
    expect(rows[2]).toContain("-5.00");
    expect(rows.at(-1)).toContain("195.00");
  });
});

describe("defaultPeriod", () => {
  it("ends yesterday and spans the period", () => {
    expect(defaultPeriod("2027-03-01", 14)).toEqual({ from: "2027-02-15", to: "2027-02-28" });
    expect(defaultPeriod("2027-01-01", 1)).toEqual({ from: "2026-12-31", to: "2026-12-31" });
  });
});
