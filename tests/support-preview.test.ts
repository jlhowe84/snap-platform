import { describe, expect, it } from "vitest";
import { messagePreview, searchTerm, waitingSince } from "@/lib/support/preview";

describe("messagePreview", () => {
  it("skips the greeting and the quoted earlier message", () => {
    const body = "Hi,\n\nI never got my order.\nCan you check?\n\nOn Mon, Nov 2 SNAP wrote:\n> Thanks for your purchase";
    expect(messagePreview(body)).toBe("I never got my order. Can you check?");
  });
  it("keeps a greeting that is the whole message, and shortens long text", () => {
    expect(messagePreview("Hello!")).toBe("Hello!");
    expect(messagePreview("a".repeat(200), 20)).toHaveLength(20);
    expect(messagePreview(null)).toBe("");
  });
});

describe("waitingSince", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  it("is quiet under a day, amber up to three days, red after", () => {
    expect(waitingSince("2026-11-20T09:00:00Z", now)).toEqual({ label: "Waiting 3 hours", tone: "muted" });
    expect(waitingSince("2026-11-19T09:00:00Z", now)).toEqual({ label: "Waiting 1 day", tone: "warn" });
    expect(waitingSince("2026-11-15T09:00:00Z", now)).toEqual({ label: "Waiting 5 days", tone: "risk" });
    expect(waitingSince(null, now)).toBeNull();
  });
});

describe("searchTerm", () => {
  it("drops characters that would change the filter", () => {
    expect(searchTerm("smith,(or)%*")).toBe("smith or");
    expect(searchTerm("pat@example.com")).toBe("pat@example.com");
  });
});
