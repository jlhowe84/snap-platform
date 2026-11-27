import { createServer, type Server } from "node:http";

// A stand-in for Google's token endpoint and the Gmail API, on loopback only.
// The app reaches it because the e2e service account's token_uri points here
// and E2E_GMAIL_API (accepted only for loopback addresses) does too. Every
// message the app sends is kept so a test can read it back at /__sent.
export const FAKE_GMAIL_PORT = 3199;
export const FAKE_GMAIL = `http://127.0.0.1:${FAKE_GMAIL_PORT}`;

type Sent = { mailbox: string; raw: string; to: string; subject: string; body: string };

export function startFakeGmail(): Promise<Server> {
  const sent: Sent[] = [];
  const inbox = new Map<string, { id: string; messages: unknown[] }[]>();
  let n = 0;
  const server = createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", FAKE_GMAIL);
      const json = (status: number, body: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (url.pathname === "/token") return json(200, { access_token: "fake-token", expires_in: 3600, token_type: "Bearer" });
      if (url.pathname === "/__sent") return json(200, sent);
      if (url.pathname === "/__reset") return (sent.length = 0), inbox.clear(), json(200, {});
      if (url.pathname === "/__inbox" && req.method === "POST") {
        const { mailbox, thread } = JSON.parse(data);
        inbox.set(mailbox, [...(inbox.get(mailbox) ?? []), thread]);
        return json(200, {});
      }
      const m = url.pathname.match(/^\/gmail\/([^/]+)\/(.+)$/);
      if (!m) return json(404, { error: "not faked" });
      const [, box, path] = m;
      if (path === "messages/send" && req.method === "POST") {
        const raw = Buffer.from(JSON.parse(data || "{}").raw ?? "", "base64url").toString("utf8");
        const header = (name: string) => raw.match(new RegExp(`^${name}: (.*)$`, "mi"))?.[1]?.trim() ?? "";
        sent.push({ mailbox: decodeURIComponent(box), raw, to: header("To"), subject: header("Subject"), body: Buffer.from(raw.split(/\r?\n\r?\n/).slice(1).join("").replace(/\s/g, ""), "base64").toString("utf8") });
        n += 1;
        return json(200, { id: `fake-${n}`, threadId: `fake-thread-${n}`, labelIds: ["SENT"] });
      }
      const threads = inbox.get(decodeURIComponent(box)) ?? [];
      if (path === "threads") return json(200, { threads: threads.map((t) => ({ id: t.id })), resultSizeEstimate: threads.length });
      const t = path.match(/^threads\/([^?]+)/);
      if (t) {
        const thread = threads.find((x) => x.id === decodeURIComponent(t[1]));
        return thread ? json(200, thread) : json(404, { error: "no such thread" });
      }
      if (path === "profile") return json(200, { emailAddress: decodeURIComponent(box), messagesTotal: 0 });
      if (path.startsWith("history") || path.startsWith("messages")) return json(200, { messages: [], history: [], historyId: "1" });
      return json(404, { error: "not faked" });
    });
  });
  return new Promise((resolve) => server.listen(FAKE_GMAIL_PORT, "127.0.0.1", () => resolve(server)));
}

/** What the app has sent through the fake Gmail so far. */
export async function sentMail(): Promise<Sent[]> {
  return (await fetch(`${FAKE_GMAIL}/__sent`)).json();
}

/** Puts one customer email in a mailbox, as Gmail would show it. */
export async function deliverEmail(input: { mailbox: string; threadId: string; from: string; subject: string; body: string }) {
  const header = (name: string, value: string) => ({ name, value });
  const thread = {
    id: input.threadId,
    messages: [
      {
        id: `${input.threadId}-m1`,
        threadId: input.threadId,
        labelIds: ["INBOX", "UNREAD"],
        internalDate: String(Date.now() - 60_000),
        payload: {
          mimeType: "text/plain",
          headers: [
            header("From", input.from),
            header("To", input.mailbox),
            header("Subject", input.subject),
            header("Date", new Date(Date.now() - 60_000).toUTCString()),
            header("Message-ID", `<${input.threadId}@e2e.test>`),
          ],
          body: { data: Buffer.from(input.body).toString("base64url"), size: input.body.length },
        },
      },
    ],
  };
  await fetch(`${FAKE_GMAIL}/__inbox`, { method: "POST", body: JSON.stringify({ mailbox: input.mailbox, thread }) });
}
