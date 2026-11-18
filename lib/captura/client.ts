import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

// Read-only Captura (ImageQuix) client, server side only.
//
// Credentials live in Supabase Vault per company and are read with the
// service role; they are never in the repo or in an environment variable.
// The client exposes only GET calls. The write endpoints Captura offers are
// deliberately absent: the lab status PUT (service-order) and the email
// unsubscribe POST/DELETE must never be called from this platform, and
// gallery creation waits until a person-approved action exists for it.

const BASE_URL = "https://api.imagequix.com";

const CredentialsSchema = z.object({
  account_id: z.string().min(1),
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
});
export type CapturaCredentials = z.infer<typeof CredentialsSchema>;

const TokenSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().optional(),
});

/** Paths this client may call. Anything else is refused before a request is made. */
const ALLOWED_GET = [
  /^gallery$/,
  /^gallery\/[A-Za-z0-9-]+$/,
  /^order$/,
  /^order\/gallery\/[A-Za-z0-9-]+$/,
  /^order\/[A-Za-z0-9-]+$/,
];

export function isAllowedCapturaPath(path: string) {
  return ALLOWED_GET.some((re) => re.test(path));
}

export async function loadCapturaCredentials(companyId: string): Promise<CapturaCredentials | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("integration_secret", {
    p_company: companyId,
    p_integration: "captura",
  });
  if (error) throw new Error(`Could not read Captura credentials: ${error.message}`);
  if (!data) return null;
  return CredentialsSchema.parse(JSON.parse(data));
}

type FetchLike = typeof fetch;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Captura's client id is a 36-character UUID and its secret a long hex
 * string. The two are easy to store in each other's slots (Captura's own
 * labels for them are unclear), so put them back in order by shape.
 */
export function normalizeCapturaCredentials(creds: CapturaCredentials): CapturaCredentials {
  const id = creds.client_id.trim();
  const secret = creds.client_secret.trim();
  if (!UUID_RE.test(id) && UUID_RE.test(secret)) {
    return { account_id: creds.account_id.trim(), client_id: secret, client_secret: id };
  }
  return { account_id: creds.account_id.trim(), client_id: id, client_secret: secret };
}

export function createCapturaClient(rawCreds: CapturaCredentials, fetchImpl: FetchLike = fetch) {
  const creds = normalizeCapturaCredentials(rawCreds);
  let token: { value: string; expiresAt: number } | null = null;

  async function getToken() {
    if (token && token.expiresAt > Date.now() + 60_000) return token.value;
    // Form-encoded, client_credentials, and no scope parameter (an empty
    // scope is rejected by Captura with invalid_scope).
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: creds.client_id,
      client_secret: creds.client_secret,
    });
    const res = await fetchImpl(`${BASE_URL}/api/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      // RFC 6749 error code only (for example invalid_client); never the body.
      const code = await res
        .json()
        .then((b: { error?: unknown }) => (typeof b?.error === "string" ? b.error.replace(/[^a-z_]/g, "") : ""))
        .catch(() => "");
      throw new Error(`Captura token request failed (${res.status}${code ? `, ${code}` : ""})`);
    }
    const parsed = TokenSchema.parse(await res.json());
    token = { value: parsed.access_token, expiresAt: Date.now() + (parsed.expires_in ?? 3600) * 1000 };
    return token.value;
  }

  async function get<T = unknown>(path: string, query: Record<string, string | number | undefined> = {}) {
    if (!isAllowedCapturaPath(path)) throw new Error(`Captura path "${path}" is not on the read-only list`);
    const url = new URL(`${BASE_URL}/api/v1/account/${encodeURIComponent(creds.account_id)}/${path}`);
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, String(v));
    const res = await fetchImpl(url, {
      method: "GET",
      headers: { authorization: `Bearer ${await getToken()}`, accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Captura GET ${path} failed (${res.status})`);
    return (await res.json()) as T;
  }

  return {
    listGalleries: (range?: { start?: number; end?: number }) => get("gallery", range),
    getGallery: (galleryId: string | number) => get(`gallery/${galleryId}`),
    listOrders: (q?: { start?: number; end?: number; orderStartDate?: string; orderEndDate?: string }) =>
      get("order", q),
    listGalleryOrders: (galleryId: string | number, range?: { start?: number; end?: number }) =>
      get(`order/gallery/${galleryId}`, range),
    getOrder: (orderId: string | number) => get(`order/${orderId}`),
  };
}
