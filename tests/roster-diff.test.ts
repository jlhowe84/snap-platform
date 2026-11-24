import { describe, expect, it } from "vitest";
import { COUNT_TOLERANCE, diffIsEmpty, offBy, readRosterDiff } from "@/lib/rosters/diff";

const base = {
  from_version: 1,
  players: { from: 20, to: 20 },
  teams: { from: 2, to: 2 },
  added: [],
  removed: [],
  changed: [],
};

describe("roster diff", () => {
  it("reads what the import stores", () => {
    const d = readRosterDiff({ ...base, removed: [{ name: "Lions", division: "U8", players: 9, kept: false }] });
    expect(d?.removed[0].name).toBe("Lions");
  });
  it("ignores anything else", () => {
    expect(readRosterDiff(null)).toBeNull();
    expect(readRosterDiff({ added: "x" })).toBeNull();
  });
  it("knows when nothing changed", () => {
    expect(diffIsEmpty(readRosterDiff(base)!)).toBe(true);
    expect(diffIsEmpty(readRosterDiff({ ...base, changed: [{ name: "Tigers", from: 11, to: 12 }] })!)).toBe(false);
  });
  it("measures how far a count is from the expected one", () => {
    expect(offBy(100, 90)).toBeCloseTo(0.1);
    expect(offBy(100, 130)! > COUNT_TOLERANCE).toBe(true);
    expect(offBy(null, 90)).toBeNull();
    expect(offBy(0, 90)).toBeNull();
  });
});
