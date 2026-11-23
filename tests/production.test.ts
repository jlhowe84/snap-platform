import { describe, expect, it } from "vitest";
import { buildBoard, type BoardJob, type BoardTask } from "@/lib/production/board";

const job = (over: Partial<BoardJob>): BoardJob => ({
  id: "j1",
  name: "Job",
  status: "in_production",
  lab: null,
  production_stage: "import",
  production_stage_since: null,
  production_started_at: null,
  days: ["2027-04-10"],
  ...over,
});
const task = (over: Partial<BoardTask>): BoardTask => ({ id: "t", job_id: "j1", title: "Task", status: "todo", due_on: null, position: 1, ...over });

describe("production board", () => {
  it("puts a job in its stage with its progress and next task", () => {
    const b = buildBoard(
      [job({ production_stage: "upload", production_stage_since: "2027-04-12T15:00:00Z" })],
      [
        task({ id: "a", position: 1, status: "done" }),
        task({ id: "c", position: 3, title: "Copy", due_on: "2027-04-13" }),
        task({ id: "b", position: 2, title: "Upload", due_on: "2027-04-20" }),
        task({ id: "x", position: 4, status: "cancelled" }),
      ],
      "2027-04-15",
    );
    const upload = b.stages.find((s) => s.stage === "upload")!;
    expect(upload.cards).toHaveLength(1);
    expect(upload.cards[0]).toMatchObject({ total: 3, done: 1, late: 1, daysInStage: 3 });
    expect(upload.cards[0].next?.title).toBe("Upload");
    expect(b.stages.filter((s) => s.cards.length)).toHaveLength(1);
  });

  it("lists planning jobs whose photo days are over as ready to start", () => {
    const b = buildBoard(
      [
        job({ id: "past", status: "planning", production_stage: null, days: ["2027-04-01", "2027-04-08"] }),
        job({ id: "half", status: "planning", production_stage: null, days: ["2027-04-01", "2027-05-08"] }),
        job({ id: "none", status: "planning", production_stage: null, days: [] }),
      ],
      [],
      "2027-04-15",
    );
    expect(b.ready.map((c) => c.job.id)).toEqual(["past"]);
    expect(b.ready[0].lastDay).toBe("2027-04-08");
  });

  it("puts a job with no stage at the first one, and lab jobs apart by photo day", () => {
    const b = buildBoard(
      [
        job({ id: "new", production_stage: null }),
        job({ id: "lab2", status: "at_lab", production_stage: "complete", days: ["2027-03-20"] }),
        job({ id: "lab1", status: "at_lab", production_stage: "complete", days: ["2027-03-01"] }),
      ],
      [],
      "2027-04-15",
    );
    expect(b.stages[0].cards.map((c) => c.job.id)).toEqual(["new"]);
    expect(b.atLab.map((c) => c.job.id)).toEqual(["lab1", "lab2"]);
  });

  it("orders a stage by the longest wait", () => {
    const b = buildBoard(
      [
        job({ id: "short", production_stage_since: "2027-04-14T00:00:00Z" }),
        job({ id: "long", production_stage_since: "2027-04-02T00:00:00Z" }),
      ],
      [],
      "2027-04-15",
    );
    expect(b.stages[0].cards.map((c) => c.job.id)).toEqual(["long", "short"]);
  });
});
