import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { formatUsMobile, toUsMobile } from "@/lib/sms/phone";
import { gsmLength, segments, toGsm } from "@/lib/sms/text";
import { consentWording, crewDayBeforeText, crewOfferText, crewShiftText, offersFor } from "@/lib/sms/crew";
import { planText, smsSettingsFrom } from "@/lib/sms/guard";
import { replyIntent } from "@/lib/sms/keywords";
import { twilioSignature, validTwilioSignature } from "@/lib/sms/twilio";

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

describe("day-before and offer texts", () => {
  it("reminds a crew member the day before, with the day's page", () => {
    const t = crewDayBeforeText({ company: "Photo Co", jobName: "River League", position: "poser", startTime: "08:30", endTime: null, place: "Main Park, Springfield", link: "https://example.com/field/abc" });
    expect(t).toBe("Photo Co: Reminder, you work tomorrow as poser, River League, 8:30 AM, Main Park, Springfield. Crew, kits and schedule: https://example.com/field/abc Reply STOP to opt out.");
    expect(segments(t)).toBeLessThanOrEqual(2);
  });

  it("tells a crew member a shift is open to them", () => {
    expect(crewOfferText({ company: "Photo Co", jobName: "River League", date: "2027-04-17", positions: ["photographer"], link: "https://example.com/shifts" })).toBe(
      "Photo Co: A photographer shift is open for you on Sat, Apr 17, 2027, River League. First to take it gets it: https://example.com/shifts Reply STOP to opt out.",
    );
    expect(crewOfferText({ company: "Photo Co", jobName: "River League", date: "2027-04-17", positions: ["photographer", "poser"], link: "x" })).toContain("Shifts are open for you");
  });

  it("offers a shift only to crew in its position and Level", () => {
    const open = [
      { position: "photographer", open_level: 1 },
      { position: "poser", open_level: 2 },
      { position: "coordinator", open_level: null },
    ];
    expect(offersFor({ id: "a", positions: ["photographer"], level: 1 }, open)).toEqual(["photographer"]);
    expect(offersFor({ id: "b", positions: ["photographer"], level: 2 }, open)).toEqual([]);
    expect(offersFor({ id: "c", positions: ["poser"], level: 2 }, open)).toEqual(["poser"]);
    expect(offersFor({ id: "d", positions: ["poser", "coordinator"], level: null }, open)).toEqual(["coordinator"]);
  });
});

describe("text guard", () => {
  const text = { to_phone: "+12155550142", body: "Photo Co: hello", created_at: "2027-04-16T10:00:00Z" };
  const now = new Date("2027-04-16T10:05:00Z");
  const on = { enabled: true, testMode: true, testRecipient: "+12155550100" };

  it("reads the settings, off and in test mode when missing", () => {
    expect(smsSettingsFrom([])).toEqual({ enabled: false, testMode: true, testRecipient: null });
    expect(smsSettingsFrom([{ key: "sms.enabled", value: true }, { key: "sms.test_mode", value: false }, { key: "sms.test_recipient", value: "215 555 0100" }])).toEqual({
      enabled: true,
      testMode: false,
      testRecipient: "+12155550100",
    });
  });

  it("holds every text while texts are off or keys are missing", () => {
    expect(planText(text, text.to_phone, { ...on, enabled: false }, true, now)).toEqual({ send: false, reason: "texts are off" });
    expect(planText(text, text.to_phone, on, false, now).send).toBe(false);
  });

  it("sends to the test number only in test mode, saying who it was for", () => {
    expect(planText(text, text.to_phone, on, true, now, "Ann")).toEqual({ send: true, to: "+12155550100", body: "TEST for Ann: Photo Co: hello", test: true });
    expect(planText(text, text.to_phone, { ...on, testRecipient: null }, true, now).send).toBe(false);
  });

  it("sends to the crew member only when test mode is off", () => {
    expect(planText(text, text.to_phone, { ...on, testMode: false }, true, now)).toEqual({ send: true, to: text.to_phone, body: text.body, test: false });
  });

  it("skips someone who said no since, and texts gone stale", () => {
    expect(planText(text, null, on, true, now)).toEqual({ send: false, reason: "no longer opted in at this number" });
    expect(planText(text, "+12155550199", on, true, now).send).toBe(false);
    expect(planText(text, text.to_phone, on, true, new Date("2027-04-16T17:00:00Z"))).toEqual({ send: false, reason: "too old to send" });
  });
});

describe("replies and webhooks", () => {
  it("reads STOP and START words", () => {
    for (const w of ["STOP", "stop", " Stop. ", "unsubscribe", "Quit"]) expect(replyIntent(w)).toBe("stop");
    for (const w of ["START", "unstop", "Yes"]) expect(replyIntent(w)).toBe("start");
    for (const w of ["stop texting me about saturday", "ok", "", null]) expect(replyIntent(w)).toBeNull();
  });

  it("checks Twilio's signature the documented way", () => {
    const params = { CallSid: "CA1234567890ABCDE", Caller: "+12349013030", Digits: "1234", From: "+12349013030", To: "+18005551212" };
    const url = "https://mycompany.com/myapp.php?foo=1&bar=2";
    const sig = twilioSignature("12345", url, params);
    expect(sig).toBe("0/KCTR6DLpKmkAf8muzZqo1nDgQ=");
    expect(validTwilioSignature("12345", url, params, sig)).toBe(true);
    expect(validTwilioSignature("12345", url, { ...params, Digits: "9999" }, sig)).toBe(false);
    expect(validTwilioSignature("12345", url, params, null)).toBe(false);
  });
});
