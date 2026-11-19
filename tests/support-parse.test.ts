import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const { bodyText, hasInbound, htmlToText, parseAddress, parseAddressList, parseThread } = await import("@/lib/support/parse");
const { syncSettings, syncWindows, windowQuery } = await import("@/lib/support/sync");

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const msg = (id: string, from: string, ms: number, extra: Record<string, unknown> = {}) => ({
  id,
  threadId: "t1",
  internalDate: String(ms),
  payload: {
    mimeType: "text/plain",
    headers: [
      { name: "From", value: from },
      { name: "To", value: "Help <help@example.com>, other@example.org" },
      { name: "Subject", value: "Where is  my order" },
    ],
    body: { data: b64("Hello there") },
  },
  ...extra,
});

describe("support mail parsing", () => {
  it("splits a name and an address", () => {
    expect(parseAddress('"Pat Parent" <Pat@Example.org>')).toEqual({ name: "Pat Parent", address: "pat@example.org" });
    expect(parseAddress("pat@example.org")).toEqual({ name: null, address: "pat@example.org" });
    expect(parseAddress("")).toEqual({ name: null, address: null });
  });

  it("lists every address in a header once", () => {
    expect(parseAddressList("A <a@x.org>, b@y.org; A@x.org")).toEqual(["a@x.org", "b@y.org"]);
  });

  it("prefers the plain text part and skips attached text files", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "text/plain", filename: "notes.txt", body: { data: b64("attachment") } },
        {
          mimeType: "multipart/alternative",
          parts: [
            { mimeType: "text/html", body: { data: b64("<p>Rich</p>") } },
            { mimeType: "text/plain", body: { data: b64("Plain\r\nbody") } },
          ],
        },
      ],
    };
    expect(bodyText(payload)).toBe("Plain\nbody");
  });

  it("falls back to the HTML part as text", () => {
    expect(bodyText({ mimeType: "text/html", body: { data: b64("<style>p{}</style><p>Hi&nbsp;Pat &amp; co</p><div>Bye<br>now</div>") } })).toBe(
      "Hi Pat & co\nBye\nnow",
    );
    expect(htmlToText("<script>alert(1)</script>ok")).toBe("ok");
  });

  it("marks the company's own mail as out and orders by time", () => {
    const thread = parseThread(
      { id: "t1", messages: [msg("m2", "SNAP <Help@example.com>", 2000), msg("m1", "Pat <pat@example.org>", 1000)] },
      ["help@example.com"],
    );
    expect(thread.subject).toBe("Where is my order");
    expect(thread.messages.map((m) => [m.id, m.direction])).toEqual([["m1", "in"], ["m2", "out"]]);
    expect(thread.messages[0].to).toEqual(["help@example.com", "other@example.org"]);
    expect(hasInbound(thread)).toBe(true);
  });

  it("drops drafts, spam and trash", () => {
    const thread = parseThread(
      { id: "t1", messages: [msg("m1", "a@x.org", 1000, { labelIds: ["DRAFT"] }), msg("m2", "a@x.org", 2000, { labelIds: ["SPAM"] })] },
      [],
    );
    expect(thread.messages).toEqual([]);
    expect(hasInbound(thread)).toBe(false);
  });
});

describe("support sync planning", () => {
  const day = 24 * 60 * 60 * 1000;

  it("reads settings with safe defaults", () => {
    expect(syncSettings([])).toEqual({ enabled: false, firstDays: 7, ownAddresses: [] });
    expect(
      syncSettings([
        { key: "support.sync_enabled", value: true },
        { key: "support.first_sync_days", value: 500 },
        { key: "support.own_addresses", value: ["a@x.org", 3] },
      ]),
    ).toEqual({ enabled: true, firstDays: 7, ownAddresses: ["a@x.org"] });
  });

  it("starts a first run the set number of days back, a day at a time", () => {
    const now = 100 * day;
    const windows = syncWindows(null, 3, now);
    expect(windows).toHaveLength(3);
    expect(windows[0].from).toBe(now - 3 * day);
    expect(windows[2].to).toBe(now);
  });

  it("starts a later run an hour before the last finished point", () => {
    const now = 100 * day;
    const windows = syncWindows(new Date(now - 600_000).toISOString(), 7, now);
    expect(windows).toEqual([{ from: now - 600_000 - 3_600_000, to: now }]);
  });

  it("asks Gmail for one stretch and leaves chats out", () => {
    expect(windowQuery({ from: 1_000_000, to: 2_000_500 })).toBe("after:1000 before:2002 -in:chats");
  });
});
