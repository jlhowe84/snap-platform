import { describe, expect, it } from "vitest";
import { hoursBetween, missingFor, pickNeeds, riskScore, waitLabel } from "@/lib/owner/view";

const need = (key: string, weight: number) => ({ key, title: key, detail: "", href: "/", weight });

describe("owner home", () => {
  it("shows at most three needs, heaviest first", () => {
    const picked = pickNeeds([need("a", 1), need("b", 9), need("c", 5), need("d", 7), need("e", 0)]);
    expect(picked.map((n) => n.key)).toEqual(["b", "d", "c"]);
  });

  it("drops needs with no weight", () => {
    expect(pickNeeds([need("a", 0)])).toEqual([]);
  });

  it("lists what a photo day lacks", () => {
    expect(missingFor({ agreement_signed: true, planning_form: "submitted", roster: "final", schedule: "complete" })).toEqual([]);
    expect(missingFor({ agreement_signed: false, planning_form: null, roster: "not_received", schedule: null })).toEqual(["agreement", "form", "roster", "schedule"]);
    expect(missingFor(undefined)).toEqual([]);
  });

  it("scores a nearer day with the same gaps higher", () => {
    const far = riskScore({ daysOut: 20, missing: ["roster"], crewOpen: 0, noCrew: false });
    const near = riskScore({ daysOut: 2, missing: ["roster"], crewOpen: 0, noCrew: false });
    expect(near).toBeGreaterThan(far);
    expect(riskScore({ daysOut: 2, missing: [], crewOpen: 0, noCrew: false })).toBe(0);
  });

  it("words a wait", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    expect(hoursBetween("2026-11-20T09:10:00Z", now)).toBe(2);
    expect(hoursBetween("2026-11-21T09:10:00Z", now)).toBe(0);
    expect(waitLabel(0)).toBe("under an hour");
    expect(waitLabel(1)).toBe("1 hour");
    expect(waitLabel(30)).toBe("30 hours");
    expect(waitLabel(72)).toBe("3 days");
  });
});
