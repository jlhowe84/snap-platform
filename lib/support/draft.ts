import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/auth";
import { costUsd, DEFAULT_MODEL, isPricedModel } from "@/lib/ask/pricing";
import { firstNameOf } from "./saved";
import { canDraft, cleanDraft, DRAFT_QUESTION, draftSystemPrompt, draftUserPrompt, type DraftMessage } from "./draft-prompt";

// A drafted reply for one support conversation. It only writes text for the
// reply box: nothing is sent and nothing is stored on the conversation.
//
// It runs as the signed-in person, so RLS decides whether they can read the
// conversation. It spends from the same daily cap as Ask SNAP
// (ask_snap_begin), and the run is logged without the customer's words or the
// draft itself.

const MAX_TOKENS = 1200;

export type DraftResult = { ok: true; draft: string } | { ok: false; message: string };

const STOPPED: Record<string, string> = {
  off: "Drafting is turned off. An owner or admin can turn it on in Settings by giving Ask SNAP a daily spending cap.",
  day: "Today's spending cap for Ask SNAP has been reached, so drafting is paused until tomorrow.",
  month: "This month's budget for Ask SNAP has been reached, so drafting is paused.",
  busy: "Your last request is still running. Give it a moment.",
};

export async function draftSupportReply(viewer: Viewer & { companyId: string }, conversationId: string): Promise<DraftResult> {
  const apiKey = serverEnv().ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, message: "Drafting is not connected yet. It needs the Claude API key added in Vercel." };

  const supabase = await createClient();
  const [{ data: c }, { data: messages }, { data: saved }, { data: modelRow }] = await Promise.all([
    supabase.from("support_conversations").select("id, subject, customer_name, organizations(name)").eq("id", conversationId).maybeSingle(),
    supabase.from("support_messages").select("direction, from_name, body_text, sent_at").eq("conversation_id", conversationId).order("sent_at"),
    supabase.from("support_saved_replies").select("title, body").eq("active", true).order("title"),
    supabase.from("settings").select("value").eq("key", "agent.model").maybeSingle(),
  ]);
  if (!c) return { ok: false, message: "That conversation was not found." };
  const thread = (messages ?? []) as DraftMessage[];
  if (!canDraft(thread)) return { ok: false, message: "There is no customer message to answer yet." };

  const model = typeof modelRow?.value === "string" ? modelRow.value : DEFAULT_MODEL;
  if (!isPricedModel(model)) return { ok: false, message: "Drafting is set to a model with no recorded price, so it cannot keep to its cap. Ask an admin to check the agent.model setting." };

  const { data: begun, error: beginError } = await supabase.rpc("ask_snap_begin", { p_question: DRAFT_QUESTION });
  const begin = (begun ?? {}) as { run_id?: string; stop?: string };
  if (beginError || (!begin.run_id && !begin.stop)) return { ok: false, message: "The draft could not start. Try again." };
  if (begin.stop) return { ok: false, message: STOPPED[begin.stop] ?? "Drafting is not available right now." };
  const runId = begin.run_id!;

  let cost = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let draft = "";
  let failure: string | null = null;
  let errorNote: string | null = null;

  try {
    const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 45_000 });
    const response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: draftSystemPrompt({ companyName: viewer.companyName ?? null, agentFirstName: firstNameOf(viewer.name) }),
      messages: [
        {
          role: "user",
          content: draftUserPrompt({
            companyName: viewer.companyName ?? null,
            agentFirstName: firstNameOf(viewer.name),
            customerName: c.customer_name,
            league: (c.organizations as { name: string } | null)?.name ?? null,
            subject: c.subject,
            messages: thread,
            savedReplies: saved ?? [],
          }),
        },
      ],
    });
    cost = costUsd(model, response.usage);
    inputTokens = response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0);
    outputTokens = response.usage.output_tokens;
    if (response.stop_reason === "refusal") {
      failure = "A draft could not be written for this one. Write the reply by hand.";
      errorNote = "refusal";
    } else {
      draft = cleanDraft(
        response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n"),
      );
    }
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      failure = "The Claude API key was not accepted. An admin needs to check it in Vercel.";
    } else if (error instanceof Anthropic.RateLimitError) {
      failure = "Drafting is busy right now. Try again in a minute.";
    } else {
      failure = "The draft could not be written. Try again.";
    }
    errorNote = error instanceof Anthropic.APIError ? `api ${error.status ?? "connection"}` : "unexpected error";
  }

  if (!draft && !failure) failure = "The draft came back empty. Try again.";
  // The draft holds a customer's details, so it is not kept on the run.
  await supabase.rpc("ask_snap_finish", {
    p_run_id: runId,
    p_ok: !failure,
    p_model: model,
    p_answer: null as unknown as string,
    p_tool_calls: 0,
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
    p_cost_usd: Math.min(Number(cost.toFixed(4)), 5),
    p_error: (errorNote ?? null) as unknown as string,
  });

  return failure ? { ok: false, message: failure } : { ok: true, draft };
}
