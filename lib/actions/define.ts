import type { z } from "zod";
import { isNeverAction } from "./never";

// The action layer. Every change the app or the agent makes goes through a
// registered action, so the same code path serves a button, an approval card
// and an agent proposal, and every run is logged (agent_actions, activity_log).
//
// kind mirrors public.action_kind:
//   read    - no side effects
//   draft   - writes a draft only a person can send
//   propose - a person approves before it runs, until autonomy is earned
//   never   - may be flagged for a person but is never executed by the agent
export type ActionKind = "read" | "draft" | "propose" | "never";

export type ActionContext = {
  companyId: string;
  actor: { type: "person"; profileId: string } | { type: "agent"; runId: string };
};

export type ActionDefinition<I extends z.ZodType, O> = {
  key: string;
  kind: ActionKind;
  description: string;
  input: I;
  run: (input: z.infer<I>, ctx: ActionContext) => Promise<O>;
};

export function defineAction<I extends z.ZodType, O>(def: ActionDefinition<I, O>) {
  if (!/^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(def.key)) {
    throw new Error(`Action key "${def.key}" must look like "area.verb"`);
  }
  if (isNeverAction(def.key) && def.kind !== "never") {
    throw new Error(`Action "${def.key}" is on the never list and must have kind "never"`);
  }
  return def;
}

export class NeverActionError extends Error {
  constructor(key: string) {
    super(`"${key}" is on the never list. Flag it for a person instead.`);
    this.name = "NeverActionError";
  }
}

/**
 * Runs an action after validating its input. The agent may never execute a
 * "never" action; a person-driven never action belongs in its own screen
 * outside this layer. Database triggers repeat these checks.
 */
export async function runAction<I extends z.ZodType, O>(
  def: ActionDefinition<I, O>,
  rawInput: unknown,
  ctx: ActionContext,
): Promise<O> {
  if (def.kind === "never" || isNeverAction(def.key)) throw new NeverActionError(def.key);
  const input = def.input.parse(rawInput);
  return def.run(input, ctx);
}
