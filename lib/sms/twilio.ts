import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

// The carrier. Keys live in Vercel environment variables, never in code:
// TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_MESSAGING_SERVICE_SID (the
// Messaging Service registered for the company's text campaign).

export type TwilioKeys = { accountSid: string; authToken: string; serviceSid: string };

export function twilioKeys(): TwilioKeys | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  const serviceSid = process.env.TWILIO_MESSAGING_SERVICE_SID ?? "";
  if (!/^AC[0-9a-f]{32}$/i.test(accountSid) || authToken.length < 16 || !/^MG[0-9a-f]{32}$/i.test(serviceSid)) return null;
  return { accountSid, authToken, serviceSid };
}

export type TwilioResult = { ok: true; sid: string } | { ok: false; error: string };

export async function sendTwilio(keys: TwilioKeys, to: string, body: string): Promise<TwilioResult> {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${keys.accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keys.accountSid}:${keys.authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, MessagingServiceSid: keys.serviceSid, Body: body }),
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!res) return { ok: false, error: "could not reach the carrier" };
  const json = (await res.json().catch(() => null)) as { sid?: unknown; message?: unknown; code?: unknown } | null;
  if (!res.ok || typeof json?.sid !== "string") {
    const why = typeof json?.message === "string" ? json.message.slice(0, 200) : `status ${res.status}`;
    return { ok: false, error: `carrier refused: ${why}` };
  }
  return { ok: true, sid: json.sid };
}

/**
 * Twilio signs each webhook: base64 HMAC-SHA1, keyed by the auth token, of the
 * full URL followed by every posted field name and value, sorted by name.
 */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

export function validTwilioSignature(authToken: string, url: string, params: Record<string, string>, given: string | null): boolean {
  if (!given) return false;
  const expected = Buffer.from(twilioSignature(authToken, url, params));
  const actual = Buffer.from(given);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
