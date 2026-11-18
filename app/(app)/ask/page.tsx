import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff, hasAnyRole, ADMIN_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { Card, PageHeader } from "@/components/ui";
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

export default async function AskPage() {
  const viewer = await requireStaff(ASK_ROLES);
  const admin = hasAnyRole(viewer, ADMIN_ROLES);
  const supabase = await createClient();
  const { data } = await supabase.rpc("ask_snap_status");
  const status = (data ?? {}) as { daily_cap?: number; spent_today?: number };
  const cap = status.daily_cap ?? 0;
  const spent = status.spent_today ?? 0;
  const connected = Boolean(serverEnv().ANTHROPIC_API_KEY);

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
    </>
  );
}
