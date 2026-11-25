import { describe, expect, it } from "vitest";
import { swapContents } from "@/lib/schedule/layout";

const slot = (id: string, over: Partial<Parameters<typeof swapContents>[0]> = {}) => ({
  id,
  schedule_id: "s1",
  kind: "team" as const,
  team_id: `team-${id}`,
  label: null,
  ...over,
});

describe("swapContents", () => {
  it("trades the teams and nothing else", () => {
    expect(swapContents(slot("a"), slot("b"))).toEqual([
      { id: "a", set: { kind: "team", team_id: "team-b", label: null } },
      { id: "b", set: { kind: "team", team_id: "team-a", label: null } },
    ]);
  });

  it("moves a break along with its label", () => {
    const plan = swapContents(slot("a"), slot("b", { kind: "break", team_id: null, label: "Lunch" }));
    expect(plan?.[0].set).toEqual({ kind: "break", team_id: null, label: "Lunch" });
    expect(plan?.[1].set).toEqual({ kind: "team", team_id: "team-a", label: null });
  });

  it("refuses a slot swapped with itself", () => {
    expect(swapContents(slot("a"), slot("a"))).toBeNull();
  });

  it("refuses slots from two different days", () => {
    expect(swapContents(slot("a"), slot("b", { schedule_id: "s2" }))).toBeNull();
  });
});
