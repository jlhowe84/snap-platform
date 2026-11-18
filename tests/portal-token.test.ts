import { describe, expect, it } from "vitest";
import { hashPortalToken, looksLikePortalToken, newPortalToken, portalLinkExpiry } from "@/lib/portal/token";

describe("portal tokens", () => {
  it("makes a 43-character token and stores only its hash", () => {
    const { token, hash } = newPortalToken();
    expect(looksLikePortalToken(token)).toBe(true);
    expect(hash).toBe(hashPortalToken(token));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
  });

  it("never repeats", () => {
    expect(newPortalToken().token).not.toBe(newPortalToken().token);
  });

  it("rejects things that are not tokens", () => {
    expect(looksLikePortalToken("expired")).toBe(false);
    expect(looksLikePortalToken("a".repeat(44))).toBe(false);
    expect(looksLikePortalToken("a".repeat(42) + "/")).toBe(false);
  });

  it("expires 60 days after the last photo day, or 60 days from now if sooner", () => {
    const now = new Date("2026-11-18T12:00:00Z");
    expect(portalLinkExpiry("2027-04-24", now).toISOString().slice(0, 10)).toBe("2027-06-23");
    expect(portalLinkExpiry("2026-11-10", now).toISOString().slice(0, 10)).toBe("2027-01-17");
    expect(portalLinkExpiry(null, now).toISOString().slice(0, 10)).toBe("2027-01-17");
  });
});
