import { describe, expect, it } from "vitest";
import { nextStep, type NextStepInput } from "@/lib/jobs/next-step";

const ready = { id: "d1", date: "2027-04-18", agreement_signed: true, planning_form: "submitted", roster: "standardized", schedule: "complete" };
const base: NextStepInput = {
  status: "planning",
  day: ready,
  hasFinishedRoster: true,
  shifts: ["filled", "filled"],
  setup: { done: 4, total: 4 },
  plannedElsewhere: false,
};

describe("nextStep", () => {
  it("says nothing for a closed job or one with no coming day", () => {
    expect(nextStep({ ...base, status: "cancelled" })).toBeNull();
    expect(nextStep({ ...base, day: null })).toBeNull();
  });

  it("walks the planning order: agreement, form, roster, finished roster, schedule", () => {
    expect(nextStep({ ...base, day: { ...ready, agreement_signed: false, planning_form: "not_sent" } })?.href).toBe("#portal");
    expect(nextStep({ ...base, day: { ...ready, planning_form: "sent" } })?.text).toMatch(/planning form/);
    expect(nextStep({ ...base, day: { ...ready, roster: "not_received" } })?.waitsOn).toBe("league");
    expect(nextStep({ ...base, hasFinishedRoster: false })?.href).toBe("#planning");
    expect(nextStep({ ...base, day: { ...ready, schedule: "submitted" } })?.waitsOn).toBe("office");
    expect(nextStep({ ...base, day: { ...ready, schedule: "started" } })?.waitsOn).toBe("league");
  });

  it("then crew: add, publish, fill", () => {
    expect(nextStep({ ...base, shifts: [] })?.href).toBe("/staffing/d1");
    expect(nextStep({ ...base, shifts: ["draft", "filled"] })?.text).toMatch(/^1 shift is not published/);
    expect(nextStep({ ...base, shifts: ["open", "open", "filled"] })?.text).toMatch(/^2 shifts are still open/);
  });

  it("then Captura setup, then all clear", () => {
    expect(nextStep({ ...base, setup: { done: 1, total: 4 } })?.text).toMatch(/3 steps left/);
    expect(nextStep(base)).toEqual({ text: "Everything is in for this photo day.", href: null, waitsOn: "nobody" });
  });

  it("skips the planning chase for a job planned in Notion", () => {
    const step = nextStep({ ...base, plannedElsewhere: true, day: { ...ready, agreement_signed: false, planning_form: "not_sent", roster: "not_received", schedule: "not_started" }, shifts: [] });
    expect(step?.href).toBe("/staffing/d1");
  });
});
