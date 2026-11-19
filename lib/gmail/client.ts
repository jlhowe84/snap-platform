import "server-only";

import { createSign } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

// Gmail through a Workspace service account with domain-wide delegation.
//
// The key lives in Supabase Vault (integration "google_workspace") and is
// read with the service role. The grant technically reaches every mailbox in
// the Workspace, so this client refuses any mailbox that is not listed in the
// company's mail.mailboxes setting. Outgoing mail must pass
// lib/mail/guard.ts first; lib/mail/send.ts and lib/mail/reply.ts are the only callers of sendRaw.

const ServiceAccountSchema = z.object({
  client_email: z.string().email(),
  private_key: z.string().min(100),
  token_uri: z.string().url().default("https://oauth2.googleapis.com/token"),
});
export type ServiceAccount = z.infer<typeof ServiceAccountSchema>;

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";
const API = "https://gmail.googleapis.com/gmail/v1/users";

export async function loadServiceAccount(companyId: string): Promise<ServiceAccount | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("integration_secret", {
    p_company: companyId,
    p_integration: "google_workspace",
  });
  if (error) throw new Error(`Could not read the Workspace key: ${error.message}`);
  if (!data) return null;
  return ServiceAccountSchema.parse(JSON.parse(data));
}

/** The mailboxes this company lets the platform open, from settings. */
export function allowedMailboxes(rows: { key: string; value: unknown }[]): string[] {
  const v = rows.find((r) => r.key === "mail.mailboxes")?.value;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase()) : [];
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

/** A signed JWT asking Google for a token that acts as `mailbox`. */
export function delegatedAssertion(sa: ServiceAccount, mailbox: string, now = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: sa.client_email, sub: mailbox, scope: GMAIL_SCOPE, aud: sa.token_uri, iat: now, exp: now + 3600 }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(sa.private_key).toString("base64url")}`;
}

type FetchLike = typeof fetch;

export type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
};
export type GmailMessage = { id: string; threadId: string; labelIds?: string[]; internalDate?: string; payload?: GmailPart };
export type GmailThread = { id: string; messages?: GmailMessage[] };

export function createGmailClient(
  sa: ServiceAccount,
  mailbox: string,
  allowed: string[],
  fetchImpl: FetchLike = fetch,
) {
  const box = mailbox.toLowerCase();
  if (!allowed.includes(box)) throw new Error(`Mailbox ${box} is not in mail.mailboxes`);
  let token: { value: string; expiresAt: number } | null = null;

  async function getToken() {
    if (token && token.expiresAt > Date.now() + 60_000) return token.value;
    const res = await fetchImpl(sa.token_uri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: delegatedAssertion(sa, box),
      }),
    });
    if (!res.ok) {
      const code = await res
        .json()
        .then((b: { error?: unknown }) => (typeof b?.error === "string" ? b.error.replace(/[^a-z_]/g, "") : ""))
        .catch(() => "");
      throw new Error(`Google token request failed (${res.status}${code ? `, ${code}` : ""})`);
    }
    const body = (await res.json()) as { access_token: string; expires_in?: number };
    token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return token.value;
  }

  async function get<T>(path: string) {
    const res = await fetchImpl(`${API}/${encodeURIComponent(box)}/${path}`, {
      headers: { authorization: `Bearer ${await getToken()}`, accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Gmail GET ${path} failed (${res.status})`);
    return (await res.json()) as T;
  }

  async function post<T>(path: string, body: unknown) {
    const res = await fetchImpl(`${API}/${encodeURIComponent(box)}/${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${await getToken()}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Gmail POST ${path} failed (${res.status})`);
    return (await res.json()) as T;
  }

  return {
    /**
     * Sends one message from this mailbox. Only lib/mail/send.ts and lib/mail/reply.ts call this,
     * after lib/mail/guard.ts has rewritten the recipients. `raw` is the
     * base64url RFC 822 text.
     */
    sendRaw: (raw: string, threadId?: string) =>
      post<{ id: string; threadId: string }>("messages/send", threadId ? { raw, threadId } : { raw }),
    /** The Message-ID header of one stored message, for answering it. No content. */
    messageIdHeader: async (id: string) => {
      const m = await get<{ payload?: GmailPart }>(
        `messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Message-ID`,
      );
      return m.payload?.headers?.find((h) => h.name.toLowerCase() === "message-id")?.value ?? null;
    },
    /**
     * Thread ids matching a Gmail search, newest first. Spam and trash are
     * left out by Gmail unless asked for, and they are never asked for.
     */
    listThreads: (q: string, pageToken?: string) =>
      get<{ threads?: { id: string }[]; nextPageToken?: string }>(
        `threads?maxResults=50&q=${encodeURIComponent(q)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
      ),
    /** One thread with its messages. Only lib/support/sync.ts calls this. */
    getThread: (id: string) => get<GmailThread>(`threads/${encodeURIComponent(id)}?format=full`),
    /** Address and message count only; no message content. */
    profile: () => get<{ emailAddress: string; messagesTotal: number; threadsTotal: number }>("profile"),
  };
}
