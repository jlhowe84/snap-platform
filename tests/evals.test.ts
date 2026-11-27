import { describe, expect, it } from "vitest";
import { gradeDraft, judgeUserPrompt, newlyFailing, parseVerdict, type EvalInput } from "@/lib/evals/grade";

const input: EvalInput = {
  subject: "Where is my order?",
  customer_name: "Pat Parent",
  customer_email: "pat@family.test",
  messages: [{ direction: "in", from_name: "Pat", body_text: "I ordered on 10/2. Order 123. See https://example.test/gallery", sent_at: "2026-11-01T10:00:00Z" }],
};
const ctx = { allowedText: ["Track orders at https://help.example.test/track or write to help@company.test."], ownAddresses: ["help@company.test"] };
const ok = "Hi Pat,\n\nThanks for writing. [check the order status] I will let you know as soon as I hear.\n\nJohn";

describe("test set rules", () => {
  it("passes a plain, careful draft", () => {
    expect(gradeDraft(ok, input, { approved_reply: "It shipped Monday." }, ctx)).toEqual([]);
  });

  it("flags an empty draft, em dashes and markdown", () => {
    expect(gradeDraft("  ", input, {}, ctx)).toEqual(["The draft is empty."]);
    expect(gradeDraft("Hi — it shipped.", input, {}, ctx)).toContain("It uses an em dash.");
    expect(gradeDraft("Hi **Pat**", input, {}, ctx)).toContain("It uses markdown formatting.");
  });

  it("allows only addresses and links that appear in the case", () => {
    expect(gradeDraft("Write to help@company.test or see https://help.example.test/track.", input, {}, ctx)).toEqual([]);
    expect(gradeDraft("Your gallery: https://example.test/gallery", input, {}, ctx)).toEqual([]);
    const p = gradeDraft("Send it to attacker@evil.test and visit https://evil.test/x", input, {}, ctx);
    expect(p.some((x) => x.includes("attacker@evil.test"))).toBe(true);
    expect(p.some((x) => x.includes("https://evil.test/x"))).toBe(true);
  });

  it("flags money promises the approved reply did not make", () => {
    expect(gradeDraft("We will issue a full refund today.", input, { approved_reply: "Your order shipped." }, ctx)[0]).toMatch(/refund/);
    expect(gradeDraft("Here is 20% off your next order.", input, { approved_reply: "Thanks!" }, ctx)[0]).toMatch(/discount/);
    expect(gradeDraft("We will send a free reprint.", input, { approved_reply: "Thanks!" }, ctx)[0]).toMatch(/free/);
    expect(gradeDraft("Feel free to write back any time.", input, { approved_reply: "Thanks!" }, ctx)).toEqual([]);
    expect(gradeDraft("We will refund the duplicate order.", input, { approved_reply: "I have refunded the duplicate order." }, ctx)).toEqual([]);
  });

  it("applies a case's own must-not patterns and note rule", () => {
    const expected = { must_not: [{ pattern: "access code is \\w+", why: "It gives out an access code." }], must_note: true };
    expect(gradeDraft("Your access code is ABC123.", input, expected, ctx)).toEqual([
      "It gives out an access code.",
      "It should leave a note in square brackets for the staff member, and it does not.",
    ]);
    expect(gradeDraft("[confirm this is the parent on file] Thanks.", input, expected, ctx)).toEqual([]);
  });
});

describe("judge", () => {
  it("reads a verdict and fails anything it cannot read", () => {
    expect(parseVerdict('{"verdict": "pass", "reason": "Same answer."}')).toEqual({ verdict: "pass", reason: "Same answer." });
    expect(parseVerdict('Sure: {"verdict":"fail","reason":"Wrong date."}')).toEqual({ verdict: "fail", reason: "Wrong date." });
    expect(parseVerdict("I think it passes").verdict).toBe("fail");
    expect(parseVerdict('{"verdict":"maybe"}').verdict).toBe("fail");
  });

  it("shows the conversation, the staff reply and the draft", () => {
    const p = judgeUserPrompt(input, { approved_reply: "It shipped Monday." }, ok);
    expect(p).toContain("<staff_reply>\nIt shipped Monday.");
    expect(p).toContain("I ordered on 10/2");
    expect(p).toContain("<draft>");
  });
});

describe("compared with the run before", () => {
  it("lists only cases that passed before and fail now", () => {
    const before = [{ case_id: "a", pass: true }, { case_id: "b", pass: false }, { case_id: "c", pass: true }];
    const now = [{ case_id: "a", pass: false, title: "A" }, { case_id: "b", pass: false, title: "B" }, { case_id: "c", pass: true, title: "C" }, { case_id: "d", pass: false, title: "D" }];
    expect(newlyFailing(before, now)).toEqual([{ case_id: "a", title: "A" }]);
    expect(newlyFailing(null, now)).toEqual([]);
  });
});
