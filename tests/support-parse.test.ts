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
    // A website form that puts HTML in its plain-text part.
    expect(bodyText({ mimeType: "text/plain", body: { data: b64('<table width="100%"><tr><td><p><u>FORM</u></p></td></tr></table>Question: Name Answer: Pat') } })).toBe("FORM\n\nQuestion: Name Answer: Pat");
    expect(bodyText({ mimeType: "text/plain", body: { data: b64("price < 5 and a > b") } })).toBe("price < 5 and a > b");
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

  it("counts a colleague's own address as the company answering", () => {
    const own = ["help@example.com", "sam@example.com"];
    const thread = parseThread(
      { id: "t1", messages: [msg("m1", "Pat <pat@example.org>", 1000), msg("m2", "Sam <sam@example.com>", 2000)] },
      own,
      [],
      ["help@example.com"],
    );
    expect(thread.messages.map((m) => m.direction)).toEqual(["in", "out"]);
  });

  it("counts a colleague who starts a thread to the mailbox as mail in", () => {
    const own = ["help@example.com", "sam@example.com"];
    const handoff = parseThread({ id: "t1", messages: [msg("m1", "Sam <sam@example.com>", 1000)] }, own, [], ["help@example.com"]);
    expect(handoff.messages.map((m) => m.direction)).toEqual(["in"]);
    // The mailbox writing first is the company writing out.
    const outbound = parseThread({ id: "t2", messages: [msg("m1", "SNAP <help@example.com>", 1000)] }, own, [], ["help@example.com"]);
    expect(outbound.messages.map((m) => m.direction)).toEqual(["out"]);
  });

  it("leaves out automatic notices until a person answers", () => {
    const quiet = ["no-reply@orders.example"];
    const receipt = msg("m1", "Orders <No-Reply@orders.example>", 1000);
    const alone = parseThread({ id: "t1", messages: [receipt] }, ["help@example.com"], quiet);
    expect(alone.messages).toEqual([]);
    const answered = parseThread({ id: "t1", messages: [receipt, msg("m2", "Pat <pat@example.org>", 2000)] }, ["help@example.com"], quiet);
    expect(answered.messages.map((m) => m.id)).toEqual(["m2"]);
    expect(answered.subject).toBe("Where is my order");
  });

  it("leaves out a sender only when the subject matches", () => {
    const rules = [{ from: "rep@lab.example", subject: "where is" }];
    const invoice = msg("m1", "Rep <rep@lab.example>", 1000);
    expect(parseThread({ id: "t1", messages: [invoice] }, [], rules).messages).toEqual([]);
    const other = [{ from: "rep@lab.example", subject: "lab invoice" }];
    expect(parseThread({ id: "t1", messages: [invoice] }, [], other).messages).toHaveLength(1);
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
    expect(syncSettings([])).toEqual({ enabled: false, firstDays: 7, ownAddresses: [], quietSenders: [], quietRules: [] });
    expect(
      syncSettings([
        { key: "support.sync_enabled", value: true },
        { key: "support.first_sync_days", value: 500 },
        { key: "support.own_addresses", value: ["a@x.org", 3] },
        { key: "support.quiet_senders", value: [" No-Reply@Orders.example ", "nope", 4] },
        { key: "support.quiet_rules", value: [{ from: "Rep@Lab.example", subject: " Lab Invoice " }, { from: "rep@lab.example" }, { from: "x", subject: "abc" }] },
      ]),
    ).toEqual({
      enabled: true, firstDays: 7, ownAddresses: ["a@x.org"], quietSenders: ["no-reply@orders.example"],
      quietRules: [{ from: "rep@lab.example", subject: "lab invoice" }],
    });
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

describe("website form mail", () => {
  const form = (replyTo: string) => {
    const m = msg("f1", "Site Owner <owner@example.com>", 1_800_000_000_000);
    m.payload.headers.push({ name: "Reply-To", value: replyTo });
    return m;
  };
  it("reads the Reply-To person as the writer, even when the form is sent from our own address", () => {
    const t = parseThread({ id: "t1", messages: [form("pat.parent@example.org")] }, ["help@example.com", "owner@example.com"]);
    expect(t.messages[0]).toMatchObject({ direction: "in", from_address: "pat.parent@example.org", from_name: null });
    const named = parseThread({ id: "t1", messages: [form("Pat Parent <Pat@Example.org>")] }, ["help@example.com"]);
    expect(named.messages[0]).toMatchObject({ direction: "in", from_address: "pat@example.org", from_name: "Pat Parent" });
  });
  it("ignores a Reply-To that is our own address or the sender's", () => {
    const own = parseThread({ id: "t1", messages: [form("help@example.com")] }, ["help@example.com"]);
    expect(own.messages[0]).toMatchObject({ direction: "in", from_address: "owner@example.com", from_name: "Site Owner" });
    const same = parseThread({ id: "t1", messages: [form("owner@example.com")] }, ["help@example.com", "owner@example.com"]);
    expect(same.messages[0].direction).toBe("out");
  });
});
