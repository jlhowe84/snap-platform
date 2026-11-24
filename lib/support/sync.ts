import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { allowedMailboxes, createGmailClient, loadServiceAccount } from "@/lib/gmail/client";
import { parseThread } from "./parse";

// Brings mail from the company's support mailboxes into the support desk.
// A server job, so it uses the service role. It only reads Gmail: nothing is
// sent, labelled, marked read or moved. The mailboxes are the ones listed in
// mail.mailboxes and no others (the Gmail client refuses the rest).
//
// Each run reads the mailbox a day at a time, oldest first, from an hour
// before the last finished point, and hands each thread to
// public.support_ingest, which stores only the messages it does not have yet.
// Running it twice is harmless, and a run that stops early is picked up by
// the next one.

export type SyncResult = {
  company: string;
  mailbox: string;
  threads: number;
  conversations: number;
  messages: number;
  partial: boolean;
  error: string | null;
};

const AT_ONCE = 6;
const DAY_MS = 24 * 60 * 60 * 1000;
const OVERLAP_MS = 60 * 60 * 1000;
const DEFAULT_FIRST_DAYS = 7;
// Leave room inside the route's 60 seconds to finish the day in hand.
const BUDGET_MS = 40_000;

type Setting = { key: string; value: unknown };

export function syncSettings(rows: Setting[]) {
  const get = (key: string) => rows.find((r) => r.key === key)?.value;
  const days = get("support.first_sync_days");
  const own = get("support.own_addresses");
  const quiet = get("support.quiet_senders");
  const rules = get("support.quiet_rules");
  return {
    enabled: get("support.sync_enabled") === true,
    firstDays: typeof days === "number" && days >= 1 && days <= 90 ? Math.floor(days) : DEFAULT_FIRST_DAYS,
    ownAddresses: Array.isArray(own) ? own.filter((x): x is string => typeof x === "string") : [],
    quietSenders: Array.isArray(quiet)
      ? quiet.filter((x): x is string => typeof x === "string" && x.includes("@")).map((x) => x.trim().toLowerCase())
      : [],
    // A sender left out only when the subject holds some text, for an address
    // that also writes real mail (a lab's invoices, say).
    quietRules: Array.isArray(rules)
      ? rules
          .filter(
            (x): x is { from: string; subject: string } =>
              !!x && typeof x === "object" && typeof (x as { from?: unknown }).from === "string" &&
              (x as { from: string }).from.includes("@") && typeof (x as { subject?: unknown }).subject === "string" &&
              (x as { subject: string }).subject.trim().length >= 3,
          )
          .map((x) => ({ from: x.from.trim().toLowerCase(), subject: x.subject.trim().toLowerCase() }))
      : [],
  };
}

/**
 * The stretches of time one run reads, oldest first, a day at a time. It
 * starts an hour before the last finished point, or `firstDays` back on the
 * first run, and ends now.
 */
export function syncWindows(lastSyncedAt: string | null, firstDays: number, now = Date.now()): { from: number; to: number }[] {
  const last = lastSyncedAt ? Date.parse(lastSyncedAt) : NaN;
  let from = Number.isFinite(last) ? Math.min(last, now) - OVERLAP_MS : now - firstDays * DAY_MS;
  const out: { from: number; to: number }[] = [];
  while (from < now) {
    const to = Math.min(from + DAY_MS, now);
    out.push({ from, to });
    from = to;
  }
  return out;
}

/** The Gmail search for one stretch. Chats are left out. */
export function windowQuery(w: { from: number; to: number }): string {
  return `after:${Math.floor(w.from / 1000)} before:${Math.ceil(w.to / 1000) + 1} -in:chats`;
}

/**
 * The scheduled run only touches companies whose support.sync_enabled
 * setting is true. A staff member can run their own company by hand.
 */
export async function runSupportSync(onlyCompanyId?: string): Promise<SyncResult[]> {
  const admin = createAdminClient();
  let q = admin.from("companies").select("id");
  if (onlyCompanyId) q = q.eq("id", onlyCompanyId);
  const { data: companies, error } = await q;
  if (error) throw new Error(`Could not list companies: ${error.message}`);

  const results: SyncResult[] = [];
  for (const company of companies ?? []) {
    const { data: rows } = await admin
      .from("settings")
      .select("key, value")
      .eq("company_id", company.id)
      .in("key", ["mail.mailboxes", "support.sync_enabled", "support.first_sync_days", "support.own_addresses", "support.quiet_senders", "support.quiet_rules"]);
    const settings = syncSettings(rows ?? []);
    if (!onlyCompanyId && !settings.enabled) continue;
    const boxes = allowedMailboxes(rows ?? []);
    if (boxes.length === 0) continue;

    let sa: Awaited<ReturnType<typeof loadServiceAccount>> = null;
    let keyError: string | null = null;
    try {
      sa = await loadServiceAccount(company.id);
      if (!sa) keyError = "No Workspace key is stored.";
    } catch {
      keyError = "The Workspace key could not be read.";
    }

    for (const mailbox of boxes) {
      const result: SyncResult = { company: company.id, mailbox, threads: 0, conversations: 0, messages: 0, partial: false, error: keyError };
      results.push(result);
      if (!sa) continue;

      try {
        const { data: state } = await admin
          .from("support_sync_state")
          .select("last_synced_at")
          .eq("company_id", company.id)
          .eq("mailbox", mailbox)
          .maybeSingle();
        const gmail = createGmailClient(sa, mailbox, boxes);
        // Conversations stored before a sender was listed as quiet, and that
        // nobody has touched, leave the queue.
        if (settings.quietSenders.length > 0) {
          await admin.rpc("support_drop_quiet", { p_company: company.id, p_senders: settings.quietSenders });
        }
        if (settings.quietRules.length > 0) {
          await admin.rpc("support_drop_quiet_rules", { p_company: company.id, p_rules: settings.quietRules });
        }
        const own = [...boxes, ...settings.ownAddresses];
        const started = Date.now();

        for (const window of syncWindows(state?.last_synced_at ?? null, settings.firstDays, started)) {
          if (Date.now() - started > BUDGET_MS) {
            result.partial = true;
            break;
          }
          const ids: string[] = [];
          let page: string | undefined;
          do {
            const list = await gmail.listThreads(windowQuery(window), page);
            for (const t of list.threads ?? []) ids.push(t.id);
            page = list.nextPageToken;
          } while (page);

          for (let i = 0; i < ids.length; i += AT_ONCE) {
            await Promise.all(
              ids.slice(i, i + AT_ONCE).map(async (id) => {
                const thread = parseThread(await gmail.getThread(id), own, [...settings.quietSenders, ...settings.quietRules], boxes);
                result.threads += 1;
                if (thread.messages.length === 0) return;
                const { data, error: ingestError } = await admin.rpc("support_ingest", {
                  p_company: company.id,
                  p_mailbox: mailbox,
                  p_thread_id: thread.threadId,
                  p_subject: thread.subject,
                  p_messages: thread.messages,
                });
                if (ingestError) throw new Error(`Could not store a thread (${ingestError.code ?? "error"})`);
                const out = data as { created?: boolean; added?: number } | null;
                if (out?.created) result.conversations += 1;
                result.messages += out?.added ?? 0;
              }),
            );
          }
          await admin.rpc("support_sync_mark", {
            p_company: company.id,
            p_mailbox: mailbox,
            p_through: new Date(window.to).toISOString(),
          });
        }
      } catch (e) {
        // Messages from Gmail and the database carry no mail content.
        result.error = e instanceof Error ? e.message.slice(0, 300) : "The sync failed.";
      }
      if (result.error) {
        await admin.rpc("support_sync_mark", { p_company: company.id, p_mailbox: mailbox, p_error: result.error });
      }
    }
  }
  return results;
}
