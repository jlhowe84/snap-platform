import type { Metadata } from "next";
import Link from "next/link";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { newlyFailing } from "@/lib/evals/grade";
import type { CaseResult } from "@/lib/evals/run";
import { setCaseActive } from "./actions";
import { RunButton } from "./run-button";

export const metadata: Metadata = { title: "Test set" };

/**
 * The agent test set: past cases with the right answer. Before a change to a
 * prompt, the knowledge base, the saved replies or the model goes live, run
 * the set; a change that makes cases fail that passed before should not ship.
 */
export default async function TestSetPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const viewer = await requireStaff(ADMIN_ROLES);
  const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: viewer.timeZone });
  const supabase = await createClient();
  const [{ data: cases }, { data: runs }] = await Promise.all([
    supabase.from("eval_cases").select("id, title, tags, active, expected, source_conversation_id, created_at").order("created_at"),
    supabase.from("eval_runs").select("id, model, judge_model, status, case_ids, passed, failed, cost_usd, results, note, started_at").order("started_at", { ascending: false }).limit(10),
  ]);
  const active = (cases ?? []).filter((c) => c.active);
  const sp = await searchParams;
  const shown = (runs ?? []).find((r) => r.id === sp.run) ?? runs?.[0] ?? null;
  const shownIndex = shown ? (runs ?? []).indexOf(shown) : -1;
  const before = shownIndex >= 0 ? (runs ?? []).slice(shownIndex + 1).find((r) => r.status === "done") ?? null : null;
  const results = (shown?.results ?? []) as CaseResult[];
  const worse = newlyFailing(before ? (before.results as CaseResult[]) : null, results);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/settings?tab=assistant" className="text-muted hover:text-text">
          ← Settings
        </Link>
      </p>
      <PageHeader eyebrow="Assistant" title="Test set" />
      <p className="mb-6 max-w-3xl text-sm text-muted">
        Past support conversations with the reply staff sent, and trick emails written to make the assistant misbehave. A run drafts each one the way the
        support desk does (without looking anything up in Captura), checks the draft against the rules, and has a second model compare it with the reply
        that was sent. Run it before changing a saved reply, a knowledge base article or the model: if cases that passed before now fail, the change
        should not go live. Nothing is sent.
      </p>

      <div className="space-y-6">
        <Card title="Run">
          <RunButton cases={active.length} />
          <p className="mt-2 text-xs text-muted">Each case costs a few cents. A run stops at its cap (evals.max_cost_usd, $2 unless changed).</p>
        </Card>

        {shown && (
          <Card title={`Run of ${when.format(new Date(shown.started_at))}`}>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <Pill tone={shown.failed === 0 && shown.status === "done" ? "ok" : "warn"}>
                {shown.passed} of {shown.case_ids.length} passed
              </Pill>
              {shown.status !== "done" && <Pill tone="warn">{shown.status === "running" ? "Still running" : "Stopped"}</Pill>}
              <span className="text-muted">
                {shown.model}, judged by {shown.judge_model} · ${Number(shown.cost_usd).toFixed(2)}
              </span>
            </div>
            {shown.note && <p className="mb-3 text-sm text-risk">{shown.note}</p>}
            {before && (
              <p className={worse.length ? "mb-3 text-sm font-semibold text-risk" : "mb-3 text-sm text-muted"}>
                {worse.length
                  ? `Worse than the run before: ${worse.length} case${worse.length === 1 ? "" : "s"} passed then and fail now (${worse.map((w) => w.title).join(", ")}).`
                  : `No case that passed in the run before fails now (${before.passed} of ${before.case_ids.length} passed then).`}
              </p>
            )}
            {results.length ? (
              <ul className="divide-y divide-line">
                {results.map((r) => (
                  <li key={r.case_id} className="py-2">
                    <details>
                      <summary className="flex min-h-10 cursor-pointer flex-wrap items-center gap-2 text-sm">
                        <Pill tone={r.pass ? "ok" : "risk"}>{r.pass ? "Pass" : "Fail"}</Pill>
                        <span className="font-semibold">{r.title}</span>
                        {!r.pass && <span className="text-muted">{r.problems[0] ?? r.judge?.reason}</span>}
                      </summary>
                      <div className="mt-2 space-y-2 text-sm">
                        {r.problems.length > 0 && (
                          <ul className="list-disc pl-5 text-risk">
                            {r.problems.map((p) => (
                              <li key={p}>{p}</li>
                            ))}
                          </ul>
                        )}
                        {r.judge && (
                          <p>
                            <span className="text-muted">Judge: </span>
                            {r.judge.verdict === "pass" ? "pass" : "fail"}. {r.judge.reason}
                          </p>
                        )}
                        {r.draft && <pre className="whitespace-pre-wrap rounded-lg border border-line bg-surface-2 p-3 font-sans text-sm">{r.draft}</pre>}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No cases have run yet.</Empty>
            )}
            {(runs?.length ?? 0) > 1 && (
              <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                Earlier runs:
                {(runs ?? []).filter((r) => r.id !== shown.id).map((r) => (
                  <Link key={r.id} href={`/settings/test-set?run=${r.id}`} className="hover:text-accent">
                    {when.format(new Date(r.started_at))} ({r.passed}/{r.case_ids.length})
                  </Link>
                ))}
              </p>
            )}
          </Card>
        )}

        <Card title={`Cases (${active.length} on${(cases?.length ?? 0) > active.length ? `, ${(cases?.length ?? 0) - active.length} off` : ""})`}>
          {cases?.length ? (
            <ul className="divide-y divide-line text-sm">
              {cases.map((c) => (
                <li key={c.id} className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className={c.active ? "font-semibold" : "font-semibold text-muted line-through"}>{c.title}</span>{" "}
                    {c.tags.map((t) => (
                      <Pill key={t} tone={t === "trick" ? "warn" : "muted"}>
                        {t === "trick" ? "Trick" : t === "real" ? "Real" : t}
                      </Pill>
                    ))}
                    {c.source_conversation_id && (
                      <Link href={`/support/${c.source_conversation_id}`} className="ml-2 text-xs text-muted hover:text-accent">
                        Conversation
                      </Link>
                    )}
                  </span>
                  <form action={setCaseActive.bind(null, c.id, !c.active)}>
                    <SubmitButton className="text-xs text-muted hover:text-accent">{c.active ? "Leave out" : "Put back"}</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No cases yet. Open a support conversation that has a good reply from us and press Add to the test set.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
