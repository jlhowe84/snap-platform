import { describe, expect, it } from "vitest";
import {
  fieldsIn,
  fillBody,
  fillSubject,
  fillTemplate,
  MESSAGES,
  messageDef,
  readTemplate,
  renderMessage,
  sampleWords,
  settingKeyOf,
  templateProblem,
} from "@/lib/messages/catalog";
import { DRAFT_LABEL } from "@/lib/clock/drafts";
import { parentConfirmation } from "@/lib/makeups/messages";

describe("message catalog", () => {
  it("has one entry per key and per settings row", () => {
    expect(new Set(MESSAGES.map((m) => m.key)).size).toBe(MESSAGES.length);
    expect(new Set(MESSAGES.map(settingKeyOf)).size).toBe(MESSAGES.length);
    expect(settingKeyOf(messageDef("makeup.reminder")!)).toBe("message.makeup.reminder");
    expect(settingKeyOf(messageDef("prepay.makeup_offer")!)).toBe("prepay.makeup_offer");
  });

  it("covers every draft the clock writes", () => {
    for (const kind of Object.keys(DRAFT_LABEL)) expect(messageDef(kind)).not.toBeNull();
  });

  it("starts every message with wording that saves, fills completely and has no em dash", () => {
    for (const def of MESSAGES) {
      expect(templateProblem(def, def.subject, def.body), def.key).toBeNull();
      const out = fillTemplate(def, sampleWords(def));
      expect(out.subject + out.body, def.key).not.toMatch(/\{[A-Za-z_]+\}/);
      expect(out.subject + out.body, def.key).not.toMatch(/[—–]/);
      expect(out.subject.length, def.key).toBeGreaterThan(0);
    }
  });
});

describe("filling a message", () => {
  it("fills fields and leaves anything that is not a field as typed", () => {
    expect(fillBody("Hi {parent}, see {nothing}", { parent: "Dana" })).toBe("Hi Dana, see {nothing}");
    expect(fieldsIn("{a} and {b} and {a}")).toEqual(["a", "b"]);
  });

  it("leaves out a paragraph whose fields are all empty, and keeps one with any text to show", () => {
    const body = "Hi {parent},\n\nWhere: {place}\n\n{details}\n\nBye";
    expect(fillBody(body, { parent: "Dana", place: "", details: "" })).toBe("Hi Dana,\n\nBye");
    expect(fillBody("Planning {season}. {last}", { season: "Spring", last: "" })).toBe("Planning Spring.");
  });

  it("keeps a subject to one line", () => {
    expect(fillSubject("About  {player}\n now", { player: "Sam" })).toBe("About Sam now");
  });
});

describe("a company's own wording", () => {
  const def = messageDef("makeup.confirmation")!;

  it("is used when saved, part by part, and the starting text otherwise", () => {
    expect(readTemplate(def, null)).toMatchObject({ subject: def.subject, body: def.body, edited: false });
    expect(readTemplate(def, {})).toMatchObject({ edited: false });
    expect(readTemplate(def, { subject: "Booked: {player}" })).toMatchObject({ subject: "Booked: {player}", body: def.body, edited: true });
    expect(readTemplate(def, { subject: 5, body: " " })).toMatchObject({ edited: false });
  });

  it("goes into the message the platform writes", () => {
    const b = { kind: "retake" as const, player: "Sam Example", league: null, team: null, date: "2027-03-01", time: "10:20", parentName: "Pat Example", email: null, phone: null, orderNumber: null, note: null };
    const o = { company: "Photo Co", place: "", details: "", manageUrl: "https://example.com/x" };
    const saved = { "message.makeup.confirmation": { subject: "See you soon, {parent}", body: "{player} is in for a {kind}.\n\nAt: {place}\n\n{link}" } };
    expect(parentConfirmation(b, o, saved)).toEqual({ subject: "See you soon, Pat", body: "Sam Example is in for a retake.\n\nhttps://example.com/x" });
    expect(parentConfirmation(b, o).subject).toBe("Retake session booked for Sam Example: Mon, Mar 1, 2027 at 10:20 AM");
    expect(() => renderMessage("no.such", {})).toThrow();
  });

  it("refuses a field the message does not have, a missing link and empty parts", () => {
    expect(templateProblem(def, "Hi", "Hello {parnt}\n\n{link}")).toMatch(/\{parnt\}/);
    expect(templateProblem(def, "Hi", "Hello {parent}")).toMatch(/\{link\}/);
    expect(templateProblem(def, " ", "{link}")).toMatch(/subject/);
    expect(templateProblem(def, "Hi", " ")).toMatch(/message/);
    expect(templateProblem(def, "Hi {parent}", "Cancel here: {link}")).toBeNull();
  });
});
