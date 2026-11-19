import { describe, expect, it } from "vitest";
import { buildDateNotice } from "@/lib/jobs/date-change";
import { PORTAL_LINK } from "@/lib/clock/drafts";

const facts = {
  companyName: "Photo Co",
  leagueName: "River League",
  contactFirstName: "Sam",
  to: ["sam@example.com"],
  fromDate: "2030-05-04",
};

describe("date change notice", () => {
  it("names both dates when a photo day moves", () => {
    const d = buildDateNotice({ ...facts, kind: "reschedule", toDate: "2030-05-11" });
    expect(d.subject).toBe("River League: your photo day has moved to Sat, May 11, 2030");
    expect(d.body).toContain("from Sat, May 4, 2030 to Sat, May 11, 2030");
    expect(d.body).toContain(PORTAL_LINK);
    expect(d.to).toEqual(["sam@example.com"]);
  });
  it("promises a new date when postponed, and gives none", () => {
    const d = buildDateNotice({ ...facts, kind: "postpone" });
    expect(d.subject).toContain("is postponed");
    expect(d.body).toContain("We will be in touch with the new date.");
  });
  it("says cancelled plainly, with no portal link", () => {
    const d = buildDateNotice({ ...facts, kind: "cancel", contactFirstName: null });
    expect(d.body.startsWith("Hi there,")).toBe(true);
    expect(d.body).toContain("is cancelled");
    expect(d.body).not.toContain(PORTAL_LINK);
  });
  it("uses no em dashes", () => {
    for (const kind of ["reschedule", "postpone", "cancel"] as const) {
      const d = buildDateNotice({ ...facts, kind, toDate: "2030-05-11" });
      expect(d.subject + d.body).not.toContain("—");
    }
  });
});
