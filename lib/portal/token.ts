import { createHash, randomBytes } from "node:crypto";

// A portal token is 32 random bytes, sent once in the link. Only its SHA-256
// hash is stored (portal_links.token_hash), so a database read never reveals
// a working link.
export function newPortalToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashPortalToken(token) };
}

export function hashPortalToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Tokens are base64url of 32 bytes: 43 characters. Anything else is not a link we made. */
export function looksLikePortalToken(value: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

/** Default lifetime: 60 days after the last photo day, and never less than 60 days from now. */
export function portalLinkExpiry(lastPhotoDay: string | null | undefined, now = new Date()) {
  const floor = new Date(now.getTime() + 60 * 86_400_000);
  if (!lastPhotoDay) return floor;
  const afterDay = new Date(`${lastPhotoDay}T00:00:00Z`);
  afterDay.setUTCDate(afterDay.getUTCDate() + 60);
  return afterDay > floor ? afterDay : floor;
}
