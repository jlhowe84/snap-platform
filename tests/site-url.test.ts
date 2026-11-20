import { describe, expect, it } from "vitest";
import { liveSiteUrl } from "@/lib/site-url";

const headers = (h: Record<string, string>) => ({ get: (k: string) => h[k] ?? null });

describe("liveSiteUrl", () => {
  it("uses the production domain even when the request came to a preview", () => {
    const h = headers({ "x-forwarded-host": "app-git-branch.vercel.app", "x-forwarded-proto": "https" });
    expect(liveSiteUrl(h, { VERCEL_PROJECT_PRODUCTION_URL: "app.example.com" })).toBe("https://app.example.com");
  });

  it("accepts a production value that already has a scheme or a trailing slash", () => {
    expect(liveSiteUrl(headers({}), { VERCEL_PROJECT_PRODUCTION_URL: "https://app.example.com/" })).toBe("https://app.example.com");
  });

  it("falls back to the request's own address off Vercel", () => {
    expect(liveSiteUrl(headers({ host: "localhost:3000", "x-forwarded-proto": "http" }), {})).toBe("http://localhost:3000");
    expect(liveSiteUrl(headers({ host: "example.test" }), { VERCEL_PROJECT_PRODUCTION_URL: " " })).toBe("https://example.test");
  });
});
