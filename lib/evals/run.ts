import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/auth";
import { costUsd, DEFAULT_MODEL, isPricedModel } from "@/lib/ask/pricing";
import { firstNameOf } from "@/lib/support/saved";
import { cleanDraft, draftSystemPrompt, draftUserPrompt, type DraftMessage } from "@/lib/support/draft-prompt";
import { gradeDraft, judgeSystemPrompt, judgeUserPrompt, parseVerdict, type EvalExpected, type EvalInput, type JudgeVerdict } from "./grade";

// Runs the agent test set. Each case is drafted exactly as the support desk
// drafts (the same prompt, the saved replies and knowledge base as they are
// now, the model in agent.model) except that nothing is looked up in Captura,
// so a run never depends on live orders. The draft is checked against the
// rules in ./grade, then a judging model compares it with the reply staff
// sent. Nothing is sent and no conversation is touched.
//
// A run is worked a few cases at a time (the page asks for the next batch
// until none are left), so no request runs long. It stops when the run's
// spending cap (evals.max_cost_usd, default $2) is reached.

const BATCH = 3;
const DEFAULT_CAP_USD = 2;

export type CaseResult = {
  case_id: string;
  title: string;
  pass: boolean;
  problems: string[];
  judge: JudgeVerdict | null;
  draft: string;
  cost_usd: number;
};

type Viewing = Viewer & { companyId: string };

function settingValue(rows: { key: string; value: unknown }[] | null, key: string) {
  return rows?.find((r) => r.key === key)?.value;
}

export async function startEvalRun(viewer: Viewing): Promise<{ ok: true; runId: string } | { ok: false; message: string }> {
  if (!serverEnv().ANTHROPIC_API_KEY) return { ok: false, message: "The test set needs the Claude API key added in Vercel." };
  const supabase = await createClient();
  const [{ data: cases }, { data: rows }] = await Promise.all([
    supabase.from("eval_cases").select("id").eq("active", true).order("created_at"),
    supabase.from("settings").select("key, value").in("key", ["agent.model", "evals.judge_model"]),
  ]);
  if (!cases?.length) return { ok: false, message: "The test set has no cases yet." };
  const model = (settingValue(rows, "agent.model") as string | undefined) ?? DEFAULT_MODEL;
  const judge = (settingValue(rows, "evals.judge_model") as string | undefined) ?? model;
  if (!isPricedModel(model) || !isPricedModel(judge)) return { ok: false, message: "The test set is set to a model with no recorded price." };
  const { data: run, error } = await supabase
    .from("eval_runs")
    .insert({ company_id: viewer.companyId, model, judge_model: judge, case_ids: cases.map((c) => c.id), started_by: viewer.id })
    .select("id")
    .single();
  if (error || !run) return { ok: false, message: "The run could not start." };
  return { ok: true, runId: run.id };
}

export type BatchResult = { ok: true; done: boolean; finished: number; total: number } | { ok: false; message: string };

/** Works the next few cases of a run. The page calls it until done. */
export async function runEvalBatch(viewer: Viewing, runId: string): Promise<BatchResult> {
  const apiKey = serverEnv().ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, message: "The test set needs the Claude API key added in Vercel." };
  const supabase = await createClient();
  const { data: run } = await supabase.from("eval_runs").select("*").eq("id", runId).maybeSingle();
  if (!run) return { ok: false, message: "That run was not found." };
  const results = (run.results ?? []) as CaseResult[];
  if (run.status !== "running") return { ok: true, done: true, finished: results.length, total: run.case_ids.length };

  const finishedIds = new Set(results.map((r) => r.case_id));
  const nextIds = run.case_ids.filter((id) => !finishedIds.has(id)).slice(0, BATCH);
  const { data: rows } = await supabase.from("settings").select("key, value").in("key", ["evals.max_cost_usd", "mail.mailboxes", "support.own_addresses"]);
  const capSetting = Number(settingValue(rows, "evals.max_cost_usd"));
  const cap = Number.isFinite(capSetting) && capSetting > 0 ? capSetting : DEFAULT_CAP_USD;
  const own = [settingValue(rows, "mail.mailboxes"), settingValue(rows, "support.own_addresses")]
    .flatMap((v) => (Array.isArray(v) ? v : []))
    .filter((x): x is string => typeof x === "string");

  let spent = Number(run.cost_usd ?? 0);
  if (nextIds.length > 0 && spent < cap) {
    const [{ data: cases }, { data: saved }] = await Promise.all([
      supabase.from("eval_cases").select("id, title, input, expected").in("id", nextIds),
      supabase.from("support_saved_replies").select("title, body").eq("active", true).order("title"),
    ]);
    const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 40_000 });
    const who = { companyName: viewer.companyName ?? null, agentFirstName: firstNameOf(viewer.name) };
    const batch = await Promise.all(
      (cases ?? []).map((c) =>
        evaluateCase(client, supabase, { ...c, input: c.input as EvalInput, expected: c.expected as EvalExpected }, {
          model: run.model,
          judgeModel: run.judge_model,
          who,
          saved: saved ?? [],
          own,
        }),
      ),
    );
    results.push(...batch);
    spent += batch.reduce((t, r) => t + r.cost_usd, 0);
  }

  const remaining = run.case_ids.filter((id) => !results.some((r) => r.case_id === id)).length;
  const stopped = remaining > 0 && spent >= cap;
  const done = remaining === 0 || stopped;
  await supabase
    .from("eval_runs")
    .update({
      results,
      passed: results.filter((r) => r.pass).length,
      failed: results.filter((r) => !r.pass).length,
      cost_usd: Number(spent.toFixed(4)),
      status: !done ? "running" : stopped ? "stopped" : "done",
      finished_at: done ? new Date().toISOString() : null,
      note: stopped ? `Stopped at the $${cap.toFixed(2)} cap with ${remaining} cases left.` : null,
    })
    .eq("id", runId);
  return { ok: true, done, finished: results.length, total: run.case_ids.length };
}

type Ctx = {
  model: string;
  judgeModel: string;
  who: { companyName: string | null; agentFirstName: string };
  saved: { title: string; body: string }[];
  own: string[];
};

async function evaluateCase(
  client: Anthropic,
  supabase: Awaited<ReturnType<typeof createClient>>,
  c: { id: string; title: string; input: EvalInput; expected: EvalExpected },
  ctx: Ctx,
): Promise<CaseResult> {
  let cost = 0;
  const base = { case_id: c.id, title: c.title };
  try {
    const messages = (c.input.messages ?? []) as DraftMessage[];
    const lastIn = [...messages].reverse().find((m) => m.direction === "in");
    const { data: articles } = await supabase.rpc("kb_search", {
      p_query: `${c.input.subject ?? ""} ${(lastIn?.body_text ?? "").slice(0, 1500)}`,
      p_shelves: ["answers", "support"],
      p_limit: 6,
    });
    const kb = (articles ?? []).map((a) => ({ title: a.title, section: a.section, body: a.body }));

    const drafted = await client.messages.create({
      model: ctx.model,
      max_tokens: 1200,
      system: draftSystemPrompt({ ...ctx.who, lookups: false }),
      messages: [
        {
          role: "user",
          content: draftUserPrompt({
            ...ctx.who,
            customerName: c.input.customer_name,
            league: null,
            subject: c.input.subject ?? "",
            messages,
            savedReplies: ctx.saved,
            articles: kb,
          }),
        },
      ],
    });
    cost += costUsd(ctx.model, drafted.usage);
    const draft = cleanDraft(drafted.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n"));

    const problems = gradeDraft(draft, c.input, c.expected, {
      allowedText: [...ctx.saved.map((s) => s.body), ...kb.map((a) => a.body)],
      ownAddresses: ctx.own,
    });

    let judge: JudgeVerdict | null = null;
    if (draft) {
      const judged = await client.messages.create({
        model: ctx.judgeModel,
        max_tokens: 300,
        system: judgeSystemPrompt(),
        messages: [{ role: "user", content: judgeUserPrompt(c.input, c.expected, draft) }],
      });
      cost += costUsd(ctx.judgeModel, judged.usage);
      judge = parseVerdict(judged.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join(""));
    }
    return { ...base, pass: problems.length === 0 && judge?.verdict === "pass", problems, judge, draft, cost_usd: Number(cost.toFixed(4)) };
  } catch (error) {
    const why = error instanceof Anthropic.APIError ? `The model call failed (${error.status ?? "connection"}).` : "The case could not be run.";
    return { ...base, pass: false, problems: [why], judge: null, draft: "", cost_usd: Number(cost.toFixed(4)) };
  }
}
