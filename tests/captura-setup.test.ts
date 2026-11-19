import { describe, expect, it } from "vitest";
import { buildSetupValues, fillWelcome, pickTemplate, readTemplates, setupProgress, stepDueOn } from "@/lib/captura/setup";

const day = { date: "2030-05-04", start_time: "09:00:00", label: null, location_name: "River Park", address: "1 Main St", city: "Town", state: "PA" };
const templates = { default: "<p>Use code {{coupon}} today.</p>", swim: "<p>Swimmers use {{coupon}}.</p>" };

describe("Captura setup values", () => {
  it("fills the four marketing fields and the welcome message", () => {
    const v = buildSetupValues({
      coupon: "30RL",
      promo: "Free button",
      sports: ["Baseball"],
      days: [day, { ...day, date: "2030-05-05", label: "Makeups", location_name: null }],
      templates,
    });
    expect(v.map((x) => x.value)).toEqual([
      "30RL",
      "River Park, 1 Main St, Town, PA",
      "Sun, May 5, 2030 · 9:00 AM · Makeups",
      "Free button",
      "<p>Use code 30RL today.</p>",
    ]);
  });

  it("leaves a value empty and says why when something is missing", () => {
    const v = buildSetupValues({ coupon: null, promo: null, sports: [], days: [], templates });
    expect(v.every((x) => x.value === null && x.missing)).toBe(true);
    expect(buildSetupValues({ coupon: "A1", promo: null, sports: [], days: [], templates: {} })[4].missing).toContain("Settings");
  });

  it("picks the template for the job's sport, else the standard one", () => {
    expect(pickTemplate(["Swim Team"], templates)?.key).toBe("swim");
    expect(pickTemplate(["Soccer"], templates)?.key).toBe("default");
    expect(pickTemplate(["Soccer"], { swim: "x" })).toBeNull();
  });

  it("escapes the coupon and reads only text templates", () => {
    expect(fillWelcome("<b>{{coupon}}</b>", "<i>")).toBe("<b>&lt;i&gt;</b>");
    expect(fillWelcome("no slot", null)).toBe("no slot");
    expect(readTemplates({ Default: "a", swim: 3, other: " " })).toEqual({ default: "a" });
    expect(readTemplates(["a"])).toEqual({});
  });

  it("dates a step from the first photo day and counts what is done", () => {
    expect(stepDueOn("2030-05-04", -45)).toBe("2030-03-20");
    expect(stepDueOn(null, -45)).toBeNull();
    const steps = [
      { id: "a", name: "A", stage: null, offset_days: -45 },
      { id: "b", name: "B", stage: null, offset_days: null },
    ];
    const p = setupProgress(steps, [
      { id: "t1", playbook_step_id: "a", status: "done", completed_at: null },
      { id: "t2", playbook_step_id: "b", status: "todo", completed_at: null },
    ]);
    expect([p.done, p.total]).toEqual([1, 2]);
  });
});
