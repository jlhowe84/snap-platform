import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { NEVER_ACTION_KEYS } from "@/lib/actions/never";
import { defineAction, runAction, NeverActionError } from "@/lib/actions/define";

function dbNeverList(): string[] {
  const dir = join(__dirname, "..", "supabase", "migrations");
  const sql = readdirSync(dir)
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
  // The last definition of private.never_action_keys() wins.
  const defs = [...sql.matchAll(/function private\.never_action_keys\(\)[\s\S]*?array\[([\s\S]*?)\]/g)];
  const body = defs.at(-1)?.[1] ?? "";
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe("never list", () => {
  it("matches the database", () => {
    expect([...NEVER_ACTION_KEYS].sort()).toEqual(dbNeverList().sort());
  });
  it("refuses to define a never action with another kind", () => {
    expect(() =>
      defineAction({ key: "money.refund", kind: "propose", description: "x", input: z.object({}), run: async () => 1 }),
    ).toThrow();
  });
  it("refuses to run a never action", async () => {
    const def = defineAction({ key: "job.cancel", kind: "never", description: "x", input: z.object({}), run: async () => 1 });
    await expect(
      runAction(def, {}, { companyId: "c", actor: { type: "agent", runId: "r" } }),
    ).rejects.toBeInstanceOf(NeverActionError);
  });
});
