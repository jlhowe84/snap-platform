import { describe, expect, it } from "vitest";
import { buildDraft, DRAFT_LABEL, firstName, missingLines, PORTAL_LINK, type DraftKind } from "@/lib/clock/drafts";

const facts = {
  companyName: "Test Co",
  leagueName: "Test League",
  contactFirstName: "Pat",
  to: ["pat@test.invalid"],
  season: "Spring 2027",
  photoDay: "2027-04-17",
  lastPhotoDay: "2026-04-18",
  holdExpires: "2026-12-09",
  dueOn: "2027-03-27",
  missing: ["roster", "schedule"],
};

describe("clock drafts", () => {
  it("lists only what is missing", () => {
    expect(missingLines(["roster", "schedule"])).toBe("- Upload your roster\n- Build your photo day schedule");
    const d = buildDraft("chase.reminder", facts);
    expect(d.body).toContain("Upload your roster");
    expect(d.body).not.toContain("planning form");
    expect(d.body).toContain("Sat, Mar 27, 2027");
  });

  it("names the release date in a hold reminder and points at the portal", () => {
    const d = buildDraft("holds.remind", facts);
    expect(d.subject).toBe("Test League: your held date releases Dec 9, 2026");
    expect(d.body).toContain("Sat, Apr 17, 2027");
    expect(d.body).toContain(PORTAL_LINK);
  });

  it("writes every kind with a greeting, the recipient and no em dash", () => {
    for (const kind of Object.keys(DRAFT_LABEL) as DraftKind[]) {
      const d = buildDraft(kind, facts);
      expect(d.to).toEqual(["pat@test.invalid"]);
      expect(d.body.startsWith("Hi Pat,")).toBe(true);
      expect(d.subject + d.body).not.toMatch(/[—–]/);
      expect(d.body).not.toContain("undefined");
    }
  });

  it("falls back when there is no contact name", () => {
    expect(firstName("  Pat  Coordinator ")).toBe("Pat");
    expect(firstName(null)).toBeNull();
    expect(buildDraft("offers.send", { ...facts, contactFirstName: null }).body.startsWith("Hi there,")).toBe(true);
  });
});
