import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff, hasAnyRole, ADMIN_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { Card, Empty, PageHeader } from "@/components/ui";
import { ASK_ROLES } from "@/lib/ask/roles";
import { AskBox } from "./ask-box";

export const metadata: Metadata = { title: "Ask SNAP" };

// A question can take a few lookups; give the server action room to finish.
export const maxDuration = 60;

const EXAMPLES = [
  "What photo days are coming up in the next two weeks?",
  "Which jobs are still waiting on a signed agreement?",
  "What is on my task list this week?",
  "What is waiting in the queue?",
];

const money = (n: number) => `$${n.toFixed(2)}`;

function field(json: unknown, key: string): string | null {
  const v = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>)[key] : null;
  return typeof v === "string" ? v : null;
}

export default async function AskPage() {
  const viewer = await requireStaff(ASK_ROLES);
  const admin = hasAnyRole(viewer, ADMIN_ROLES);
  const supabase = await createClient();
  const { data } = await supabase.rpc("ask_snap_status");
  const status = (data ?? {}) as { daily_cap?: number; spent_today?: number };
  const cap = status.daily_cap ?? 0;
  const spent = status.spent_today ?? 0;
  const connected = Boolean(serverEnv().ANTHROPIC_API_KEY);

  // The log: owner and admin only (RLS returns nothing to anyone else).
  const { data: runs } = admin
    ? await supabase
        .from("agent_runs")
        .select("id, started_at, status, input, output, error, tool_calls, cost_usd")
        .eq("trigger", "ask_snap")
        .order("started_at", { ascending: false })
        .limit(30)
    : { data: null };
  const askers = [...new Set((runs ?? []).map((r) => field(r.input, "asked_by")).filter((v): v is string => Boolean(v)))];
  const { data: people } = askers.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", askers)
    : { data: null };
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name ?? p.email]));
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: viewer.timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });

  const blocked = !connected
    ? admin
      ? "Ask SNAP is not connected yet. Add the Claude API key in Vercel as ANTHROPIC_API_KEY, then redeploy."
      : "Ask SNAP is not connected yet. An owner or admin needs to finish setting it up."
    : cap <= 0
      ? "Ask SNAP is turned off. An owner or admin can turn it on in Settings by giving it a daily spending cap."
      : spent >= cap
        ? "Ask SNAP has reached today's spending cap. It will answer again tomorrow."
        : null;

  return (
    <>
      <PageHeader eyebrow="Assistant" title="Ask SNAP" />
      <Card className="max-w-3xl">
        <p className="mb-4 text-sm text-muted">
          Ask about jobs, leagues, photo days, tasks and the queue. Ask SNAP only reads what you can already open, and it
          cannot send or change anything.
        </p>
        {blocked && <p className="mb-4 rounded-lg border border-line px-3 py-2 text-sm text-risk">{blocked}</p>}
        <AskBox examples={EXAMPLES} disabled={Boolean(blocked)} />
      </Card>
      {admin && connected && cap > 0 && (
        <p className="mt-3 max-w-3xl text-xs text-muted">
          Used today: {money(spent)} of the {money(cap)} daily cap.{" "}
          <Link href="/settings" className="text-accent hover:underline">Change the cap</Link>
        </p>
      )}
      {admin && (
        <Card title="Recent questions" className="mt-6 max-w-3xl">
          <p className="mb-3 text-xs text-muted">The last 30 questions anyone asked. Only owners and admins see this list.</p>
          {!runs?.length ? (
            <Empty>No questions yet.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {runs.map((r) => {
                const answer = field(r.output, "answer");
                return (
                  <li key={r.id} className="py-3">
                    <details>
                      <summary className="cursor-pointer text-sm">
                        <span className="font-medium">{field(r.input, "question") ?? "(no question recorded)"}</span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {nameOf.get(field(r.input, "asked_by") ?? "") ?? "Someone"} · {when.format(new Date(r.started_at))} ·{" "}
                          {r.tool_calls} {r.tool_calls === 1 ? "lookup" : "lookups"} · ${Number(r.cost_usd).toFixed(4)}
                          {r.status === "failed" && " · no answer"}
                          {r.status === "running" && " · in progress"}
                        </span>
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
                        {answer ?? (r.status === "running" ? "Still being answered." : r.status === "succeeded" ? "A reply was drafted in the support desk. Drafts are not kept here." : `No answer was given${r.error ? ` (${r.error})` : ""}.`)}
                      </p>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
