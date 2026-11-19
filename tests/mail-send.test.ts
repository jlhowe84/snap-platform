import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = { key: string; value: unknown };
const state: { settings: Row[]; rpc: { name: string; args: Record<string, unknown> }[]; raw: string[]; links: unknown[] } = {
  settings: [],
  rpc: [],
  raw: [],
  links: [],
};

const JOB = "40000000-0000-4000-8000-0000000000a1";
const PERSON = "10000000-0000-4000-8000-0000000000a1";

function table(name: string) {
  const result =
    name === "settings"
      ? { data: state.settings }
      : name === "job_contacts"
        ? { data: [{ contacts: { id: "c1", email: "Coach@League.example" } }] }
        : name === "photo_days"
          ? { data: [{ date: "2027-04-24" }] }
          : { data: [] };
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit"]) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
  chain.insert = (row: unknown) => {
    state.links.push(row);
    return { select: () => ({ single: async () => ({ data: { id: "link-1" }, error: null }) }) };
  };
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: table,
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpc.push({ name, args });
      if (name === "action_send_begin") {
        return {
          data: {
            action_type_key: "chase.request",
            draft: { to: ["coach@league.example"], subject: "Your photo day", body: "Start here: [portal link]" },
            record_refs: { job_id: JOB },
            decided_by: PERSON,
          },
          error: null,
        };
      }
      return { data: "sent", error: null };
    },
  }),
}));

vi.mock("@/lib/gmail/client", () => ({
  loadServiceAccount: async () => ({ client_email: "svc@example.com", private_key: "k", token_uri: "https://example.com" }),
  allowedMailboxes: (rows: Row[]) => (rows.find((r) => r.key === "mail.mailboxes")?.value as string[]) ?? [],
  createGmailClient: (_sa: unknown, box: string, allowed: string[]) => {
    if (!allowed.includes(box)) throw new Error("not allowed");
    return {
      sendRaw: async (raw: string) => {
        state.raw.push(Buffer.from(raw, "base64url").toString());
        return { id: "m1", threadId: "t1" };
      },
    };
  },
}));

const { sendApprovedAction, senderMailbox } = await import("@/lib/mail/send");

const base = [
  { key: "mail.test_mode", value: true },
  { key: "mail.mailboxes", value: ["box@snap.example"] },
];

beforeEach(() => {
  state.settings = [...base, { key: "mail.test_recipient", value: "owner@snap.example" }];
  state.rpc = [];
  state.raw = [];
  state.links = [];
});

describe("sending an approved draft", () => {
  it("sends to the test address only while test mode is on", async () => {
    const r = await sendApprovedAction("co", "act", "https://app.example/");
    expect(r).toEqual({ ok: true, sentTo: ["owner@snap.example"], testMode: true });
    expect(state.raw).toHaveLength(1);
    const headers = state.raw[0].split("\r\n\r\n")[0];
    expect(headers).toContain("To: owner@snap.example\r\n");
    expect(headers).toContain("From: box@snap.example\r\n");
    expect(headers).toContain("Subject: [TEST to coach@league.example] Your photo day");
    expect(headers.split("\r\n").filter((l) => l.startsWith("To:") && l.includes("league.example"))).toHaveLength(0);
  });

  it("fills the portal link at send time and stores no token", async () => {
    await sendApprovedAction("co", "act", "https://app.example/");
    const body = Buffer.from(state.raw[0].split("\r\n\r\n")[1].replace(/\r\n/g, ""), "base64").toString();
    expect(body).toMatch(/^Start here: https:\/\/app\.example\/p\/[A-Za-z0-9_-]{43}$/);
    const token = body.split("/p/")[1];
    expect(state.links).toHaveLength(1);
    expect(JSON.stringify(state.links)).not.toContain(token);
    const finish = state.rpc.find((c) => c.name === "action_send_finish")!;
    expect(finish.args.p_ok).toBe(true);
    expect(JSON.stringify(finish.args)).not.toContain(token);
    expect(finish.args.p_result).toMatchObject({ sent_to: ["owner@snap.example"], intended_to: ["coach@league.example"], test_mode: true });
  });

  it("sends nothing and claims nothing when no test address is set", async () => {
    state.settings = base;
    const r = await sendApprovedAction("co", "act", "https://app.example");
    expect(r.ok).toBe(false);
    expect(state.rpc).toHaveLength(0);
    expect(state.raw).toHaveLength(0);
  });

  it("treats a missing test mode setting as test mode", async () => {
    state.settings = [{ key: "mail.mailboxes", value: ["box@snap.example"] }];
    const r = await sendApprovedAction("co", "act", "https://app.example");
    expect(r.ok).toBe(false);
    expect(state.raw).toHaveLength(0);
  });

  it("sends only from an allowed mailbox", () => {
    expect(senderMailbox([{ key: "mail.mailboxes", value: ["a@x.example", "b@x.example"] }])).toBe("a@x.example");
    expect(senderMailbox([{ key: "mail.mailboxes", value: ["a@x.example", "b@x.example"] }, { key: "mail.send_from", value: "B@x.example" }])).toBe("b@x.example");
    expect(senderMailbox([{ key: "mail.mailboxes", value: ["a@x.example"] }, { key: "mail.send_from", value: "other@x.example" }])).toBe("a@x.example");
    expect(senderMailbox([])).toBeNull();
  });
});
