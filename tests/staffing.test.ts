import { describe, expect, it } from "vitest";
import { crewForShift, defaultCounts, nextWave, planShifts, responseMessage, staffingSummary, waveLabel } from "@/lib/staffing/plan";

describe("planShifts", () => {
  it("numbers per-station positions when the count matches the stations", () => {
    const plan = planShifts(defaultCounts(2), 2);
    expect(plan).toEqual([
      { position: "photographer", station: 1 },
      { position: "photographer", station: 2 },
      { position: "poser", station: 1 },
      { position: "poser", station: 2 },
      { position: "coordinator", station: null },
    ]);
  });
  it("leaves stations off when the count differs, and clamps bad counts", () => {
    const plan = planShifts({ photographer: 3, poser: -1, coordinator: 2, photo_attendant: 1.7 }, 2);
    expect(plan.filter((p) => p.position === "photographer").every((p) => p.station === null)).toBe(true);
    expect(plan.filter((p) => p.position === "poser")).toHaveLength(0);
    expect(plan.filter((p) => p.position === "photo_attendant")).toHaveLength(1);
  });
});

describe("waves", () => {
  it("opens one Level at a time, then to everyone", () => {
    expect(nextWave(1)).toBe(2);
    expect(nextWave(4)).toBe(5);
    expect(nextWave(5)).toBeNull();
    expect(nextWave(null)).toBeNull();
    expect(waveLabel("open", 1)).toBe("Open to Level 1");
    expect(waveLabel("open", 3)).toBe("Open to Levels 1 to 3");
    expect(waveLabel("open", null)).toBe("Open to everyone");
    expect(waveLabel("draft", null)).toBe("Not published");
  });
});

describe("crewForShift", () => {
  it("lists active crew for the position, free first, then by Level", () => {
    const crew = [
      { id: "a", full_name: "Ann", positions: ["photographer"], level: 2, active: true },
      { id: "b", full_name: "Bo", positions: ["photographer"], level: 1, active: true },
      { id: "c", full_name: "Cy", positions: ["poser"], level: 1, active: true },
      { id: "d", full_name: "Di", positions: ["photographer"], level: 1, active: false },
      { id: "e", full_name: "Ed", positions: ["photographer"], level: null, active: true },
      { id: "f", full_name: "Fay", positions: ["photographer"], level: 1, active: true },
    ];
    const list = crewForShift(crew, "photographer", new Set(["f"]));
    expect(list.map((c) => c.id)).toEqual(["b", "a", "e", "f"]);
    expect(list.at(-1)?.busy).toBe(true);
  });
});

describe("summary and messages", () => {
  it("counts filled, open and unpublished shifts, leaving out cancelled", () => {
    expect(staffingSummary([{ status: "filled" }, { status: "open" }, { status: "draft" }, { status: "cancelled" }])).toEqual({
      total: 3,
      filled: 1,
      open: 1,
      drafts: 1,
    });
  });
  it("explains every answer", () => {
    expect(responseMessage("accepted").ok).toBe(true);
    expect(responseMessage("conflict").ok).toBe(false);
    expect(responseMessage("no_longer_open").ok).toBe(false);
  });
});
