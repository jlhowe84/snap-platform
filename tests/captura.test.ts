import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const { createCapturaClient, isAllowedCapturaPath } = await import("@/lib/captura/client");

describe("captura client", () => {
  it("only allows read paths", () => {
    expect(isAllowedCapturaPath("gallery")).toBe(true);
    expect(isAllowedCapturaPath("order/gallery/123")).toBe(true);
    expect(isAllowedCapturaPath("subscription/ABC/unsubscribe")).toBe(false);
    expect(isAllowedCapturaPath("../service-order/ABC/1")).toBe(false);
  });

  it("gets a token once and sends only GETs", async () => {
    const calls: { url: string; method: string }[] = [];
    const fake = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? "GET" });
      if (String(url).endsWith("/api/oauth/token")) {
        return new Response(JSON.stringify({ access_token: "t", expires_in: 64799 }));
      }
      return new Response("[]");
    }) as typeof fetch;
    const client = createCapturaClient({ account_id: "ACC", client_id: "id", client_secret: "s" }, fake);
    await client.listGalleries();
    await client.getOrder(5);
    expect(calls.filter((c) => c.url.endsWith("/oauth/token"))).toHaveLength(1);
    expect(calls.filter((c) => !c.url.endsWith("/oauth/token")).every((c) => c.method === "GET")).toBe(true);
    expect(calls.some((c) => /service-order|unsubscribe/.test(c.url))).toBe(false);
  });
});
