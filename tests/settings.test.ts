import { describe, expect, it } from "vitest";
import { chaseOrderProblem, EDITABLE_KEYS } from "@/lib/settings/editable";

const defaults = {
  "chase.weeks_request": 8, "chase.weeks_reminder": 5, "chase.weeks_due_soon": 4, "chase.weeks_due": 3, "chase.deadline_days": 10,
};

describe("editable settings", () => {
  it("accepts the shipped chase timing", () => {
    expect(chaseOrderProblem(defaults)).toBeNull();
  });
  it("refuses chase steps out of order", () => {
    expect(chaseOrderProblem({ ...defaults, "chase.weeks_reminder": 9 })).toContain("Reminder cannot come before First request");
    expect(chaseOrderProblem({ ...defaults, "chase.deadline_days": 30 })).toContain("final deadline");
  });
  it("never offers the switches that are turned on deliberately", () => {
    for (const key of ["mail.test_mode", "mail.test_recipient", "clock.enabled", "signin.allowed_domains", "mail.mailboxes"]) {
      expect(EDITABLE_KEYS.has(key)).toBe(false);
    }
  });
});
