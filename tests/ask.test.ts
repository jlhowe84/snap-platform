import { describe, expect, it } from "vitest";
import { costUsd, DEFAULT_MODEL, isPricedModel } from "@/lib/ask/pricing";
import { ASK_TOOLS, runAskTool, safeSearch } from "@/lib/ask/tools";

describe("Ask SNAP pricing", () => {
  it("prices the default model per million tokens", () => {
    expect(isPricedModel(DEFAULT_MODEL)).toBe(true);
    expect(costUsd(DEFAULT_MODEL, { input_tokens: 50_000, output_tokens: 0 })).toBeCloseTo(0.005);
    expect(costUsd(DEFAULT_MODEL, { input_tokens: 10_000, output_tokens: 1_000 })).toBeCloseTo(0.0015);
  });

  it("uses the long-prompt rate past 100K tokens and counts cached tokens", () => {
    expect(costUsd(DEFAULT_MODEL, { input_tokens: 200_000, output_tokens: 1_000 })).toBeCloseTo(0.1025);
    expect(costUsd("claude-sonnet-5-5", { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 })).toBeCloseTo(0.2);
  });

  it("refuses a model with no price", () => {
    expect(isPricedModel("some-other-model")).toBe(false);
    expect(() => costUsd("some-other-model", { input_tokens: 1, output_tokens: 1 })).toThrow();
  });
});

describe("Ask SNAP lookups", () => {
  const ctx = { supabase: null as never, viewerId: "00000000-0000-0000-0000-000000000001" };

  it("offers only read lookups with closed schemas", () => {
    expect(ASK_TOOLS.length).toBeGreaterThan(0);
    for (const t of ASK_TOOLS) {
      expect(t.name).toMatch(/^(find|get|list|photo_days|queue|planning)_/);
      expect((t.input_schema as { additionalProperties?: boolean }).additionalProperties).toBe(false);
    }
  });

  it("strips filter syntax from search text", () => {
    expect(safeSearch("Tigers%,status.eq.cancelled)")).toBe("Tigers status.eq.cancelled");
    expect(safeSearch("  St. Mary's  B&G ")).toBe("St. Mary's B&G");
  });

  it("turns bad input and unknown lookups into error results without touching the database", async () => {
    expect((await runAskTool("delete_everything", {}, ctx)).isError).toBe(true);
    expect((await runAskTool("get_job", { job_id: "not-an-id" }, ctx)).isError).toBe(true);
    expect((await runAskTool("photo_days_between", { date_from: "next week", date_to: "2027-03-01" }, ctx)).isError).toBe(true);
    expect((await runAskTool("find_jobs", { status: "exploded" }, ctx)).isError).toBe(true);
  });
});
