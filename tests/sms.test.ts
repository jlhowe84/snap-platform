import { describe, expect, it } from "vitest";
import { formatUsMobile, toUsMobile } from "@/lib/sms/phone";
import { gsmLength, segments, toGsm } from "@/lib/sms/text";
import { consentWording, crewShiftText } from "@/lib/sms/crew";

describe("US mobile numbers", () => {
  it("reads the ways people type a number", () => {
    for (const typed of ["(215) 555-0142", "215.555.0142", "2155550142", "1 215 555 0142", "+1 215-555-0142"]) {
      expect(toUsMobile(typed)).toBe("+12155550142");
    }
  });

  it("refuses what is not a US number", () => {
    for (const bad of ["", null, "555-0142", "015 555 0142", "215 155 0142", "+44 20 7946 0958", "call me", "215555014212"]) {
      expect(toUsMobile(bad)).toBeNull();
    }
  });

  it("shows a stored number the familiar way", () => {
    expect(formatUsMobile("+12155550142")).toBe("(215) 555-0142");
    expect(formatUsMobile(null)).toBe("");
  });
});

describe("GSM text", () => {
  it("swaps typographic characters and drops emoji", () => {
    expect(toGsm("It’s “picture day” — see you \u{1F4F8}")).toBe("It's \"picture day\" - see you");
  });

  it("counts segments the way carriers bill them", () => {
    expect(segments("a".repeat(160))).toBe(1);
    expect(segments("a".repeat(161))).toBe(2);
    expect(segments("a".repeat(306))).toBe(2);
    expect(gsmLength("[]")).toBe(4);
  });
});

describe("crew texts", () => {
  const base = {
    company: "Photo Co",
    jobName: "River League",
    date: "2027-04-17",
    position: "photo_attendant",
    startTime: "09:00",
    endTime: "13:00",
    link: "https://example.com/shifts",
  };

  it("tells a crew member they are on a shift", () => {
    const t = crewShiftText({ ...base, kind: "added" });
    expect(t).toBe("Photo Co: You're on a shift. Photo attendant, Sat, Apr 17, 2027, 9:00 AM to 1:00 PM, River League. Details: https://example.com/shifts Reply STOP to opt out.");
    expect(segments(t)).toBeLessThanOrEqual(2);
  });

  it("tells a crew member they are off a shift", () => {
    const t = crewShiftText({ ...base, kind: "removed" });
    expect(t.startsWith("Photo Co: You've been taken off your photo attendant shift on Sat, Apr 17, 2027 (River League).")).toBe(true);
    expect(t.endsWith("Reply STOP to opt out.")).toBe(true);
  });

  it("keeps a long job name to two segments", () => {
    const t = crewShiftText({ ...base, kind: "added", jobName: "Very Long League Name ".repeat(10) });
    expect(segments(t)).toBeLessThanOrEqual(2);
    expect(t).toContain("...");
  });

  it("stays plain text whatever the job is called", () => {
    const t = crewShiftText({ ...base, kind: "added", jobName: "Lions \u{1F981} — Spring" });
    expect(toGsm(t)).toBe(t);
  });

  it("names the company and how to stop in the opt-in wording", () => {
    const w = consentWording("Photo Co");
    expect(w).toContain("Photo Co shifts");
    expect(w).toContain("Reply STOP");
    expect(w).toContain("not a condition");
  });
});
