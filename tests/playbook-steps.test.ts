import { describe, expect, it } from "vitest";
import { neighbour, offsetText, readStepForm, stepRow, timingLabel, withCapturaTag } from "@/lib/playbooks/steps";

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

describe("playbook step form", () => {
  it("turns the form into a row, days before as a negative offset", () => {
    const parsed = readStepForm(form({ name: " Create the job ", stage: "Pre-Planning", owner_hint: "", description: "", days: "45", when: "before", captura: "on", active: "on" }));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(stepRow(parsed.data, ["rush"])).toEqual({
      name: "Create the job",
      stage: "Pre-Planning",
      owner_hint: null,
      description: null,
      offset_days: -45,
      offset_text: "-45d",
      tags: ["rush", "captura"],
      active: true,
    });
  });

  it("keeps no due date as none, and after photo day as a plus", () => {
    const none = readStepForm(form({ name: "A", days: "", when: "before" }));
    expect(none.success && stepRow(none.data)).toMatchObject({ offset_days: null, offset_text: "none", active: false, tags: [] });
    const after = readStepForm(form({ name: "A", days: "3", when: "after", active: "on" }));
    expect(after.success && stepRow(after.data)).toMatchObject({ offset_days: 3, offset_text: "+3d" });
    expect(offsetText(0)).toBe("0d");
  });

  it("refuses a step with no name or a bad number of days", () => {
    expect(readStepForm(form({ name: "  ", when: "before" })).success).toBe(false);
    expect(readStepForm(form({ name: "A", days: "-2", when: "before" })).success).toBe(false);
    expect(readStepForm(form({ name: "A", days: "1.5", when: "before" })).success).toBe(false);
    expect(readStepForm(form({ name: "A", days: "400", when: "before" })).success).toBe(false);
  });

  it("says the timing in plain words", () => {
    expect(timingLabel(-45)).toBe("45 days before photo day");
    expect(timingLabel(1)).toBe("1 day after photo day");
    expect(timingLabel(0)).toBe("On photo day");
    expect(timingLabel(null)).toBe("No due date");
  });

  it("adds and removes only the Captura tag", () => {
    expect(withCapturaTag(["a", "captura"], false)).toEqual(["a"]);
    expect(withCapturaTag(["captura", "a"], true)).toEqual(["a", "captura"]);
  });

  it("finds the step to swap with, and none at either end", () => {
    const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(neighbour(list, "b", "up")?.id).toBe("a");
    expect(neighbour(list, "b", "down")?.id).toBe("c");
    expect(neighbour(list, "a", "up")).toBeNull();
    expect(neighbour(list, "c", "down")).toBeNull();
    expect(neighbour(list, "x", "up")).toBeNull();
  });
});
