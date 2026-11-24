import type { GmailMessage, GmailPart, GmailThread } from "@/lib/gmail/client";

// Turns a Gmail thread into the plain rows the support desk stores. No
// network and no database here, so every rule can be tested on its own.

export type ParsedMessage = {
  id: string;
  direction: "in" | "out";
  from_address: string | null;
  from_name: string | null;
  to: string[];
  cc: string[];
  body: string;
  sent_at: string;
};

export type ParsedThread = { threadId: string; subject: string; messages: ParsedMessage[] };

const MAX_BODY = 100_000;

function header(part: GmailPart | undefined, name: string): string {
  const wanted = name.toLowerCase();
  return part?.headers?.find((h) => h.name.toLowerCase() === wanted)?.value ?? "";
}

/** "Pat Parent <pat@example.org>" becomes its name and its address. */
export function parseAddress(value: string): { name: string | null; address: string | null } {
  const v = value.trim();
  if (!v) return { name: null, address: null };
  const angled = v.match(/^(.*?)<([^<>\s]+@[^<>\s]+)>\s*$/);
  if (angled) {
    const name = angled[1].trim().replace(/^"(.*)"$/, "$1").trim();
    return { name: name || null, address: angled[2].toLowerCase() };
  }
  const bare = v.match(/[^\s<>,;"]+@[^\s<>,;"]+/);
  return { name: null, address: bare ? bare[0].toLowerCase() : null };
}

/** Every address in a To or Cc header, lower case, with no repeats. */
export function parseAddressList(value: string): string[] {
  const found = value.match(/[^\s<>,;"]+@[^\s<>,;"]+/g) ?? [];
  return [...new Set(found.map((a) => a.toLowerCase()))];
}

function decode(data: string | undefined): string {
  return data ? Buffer.from(data, "base64url").toString("utf8") : "";
}

function findPart(part: GmailPart | undefined, mime: string): GmailPart | null {
  if (!part) return null;
  // An attached text file is not the message.
  if (part.mimeType === mime && !part.filename && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const hit = findPart(child, mime);
    if (hit) return hit;
  }
  return null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** A readable plain-text version of an HTML body. Nothing is rendered. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function bodyText(payload: GmailPart | undefined): string {
  const plain = findPart(payload, "text/plain");
  const raw = plain ? decode(plain.body?.data) : "";
  // Some senders (website forms) put HTML in the plain-text part.
  const text = plain
    ? /<(table|div|p|td|br|html|body)[\s>/]/i.test(raw) ? htmlToText(raw) : raw
    : htmlToText(decode(findPart(payload, "text/html")?.body?.data));
  return text.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim().slice(0, MAX_BODY);
}

const SKIP_LABELS = new Set(["DRAFT", "SPAM", "TRASH"]);

/** A sender whose mail is left out, always or only when the subject holds some text. */
export type QuietRule = { from: string; subject?: string };

function isQuiet(address: string | null, subject: string, rules: QuietRule[]): boolean {
  if (!address) return false;
  const s = subject.toLowerCase();
  return rules.some((r) => r.from === address && (!r.subject || s.includes(r.subject)));
}

function parseMessage(m: GmailMessage, own: Set<string>, quiet: QuietRule[]): ParsedMessage | null {
  if (m.labelIds?.some((l) => SKIP_LABELS.has(l))) return null;
  const sentBy = parseAddress(header(m.payload, "From"));
  // Automatic notices (order receipts and the like) are not support mail.
  if (isQuiet(sentBy.address, header(m.payload, "Subject"), quiet)) return null;
  // A website form is sent from the site's address (often one of our own)
  // with the person's address as Reply-To. The person is who wrote.
  const replyTo = parseAddress(header(m.payload, "Reply-To"));
  const from = replyTo.address && replyTo.address !== sentBy.address && !own.has(replyTo.address) ? replyTo : sentBy;
  const ms = Number(m.internalDate);
  if (!m.id || !Number.isFinite(ms) || ms <= 0) return null;
  return {
    id: m.id,
    // Mail from one of the company's own addresses is the company answering.
    direction: from.address && own.has(from.address) ? "out" : "in",
    from_address: from.address,
    from_name: from.name,
    to: parseAddressList(header(m.payload, "To")),
    cc: parseAddressList(header(m.payload, "Cc")),
    body: bodyText(m.payload),
    sent_at: new Date(ms).toISOString(),
  };
}

/**
 * `ownAddresses` are the company's own sending addresses (the mailbox itself
 * and any others in settings, such as each person who answers from their own
 * address). `mailboxes` are the support mailboxes themselves. Drafts, spam and trash are dropped, and so is
 * mail matching `quietRules`: automatic notices that only matter once a person
 * answers one, at which point the answer comes in as its own message.
 */
export function parseThread(
  thread: GmailThread,
  ownAddresses: Iterable<string>,
  quietRules: Iterable<string | QuietRule> = [],
  mailboxes: Iterable<string> = [],
): ParsedThread {
  const own = new Set([...ownAddresses].map((a) => a.toLowerCase()));
  const quiet = [...quietRules]
    .map((r) => (typeof r === "string" ? { from: r } : r))
    .map((r) => ({ from: r.from.trim().toLowerCase(), subject: r.subject?.trim().toLowerCase() || undefined }));
  const messages = (thread.messages ?? [])
    .map((m) => parseMessage(m, own, quiet))
    .filter((m): m is ParsedMessage => m !== null)
    .sort((a, b) => a.sent_at.localeCompare(b.sent_at));
  // A colleague who starts a thread by writing to the support mailbox is
  // handing work to the desk, not answering a customer: it counts as mail in.
  const boxes = new Set([...mailboxes].map((a) => a.toLowerCase()));
  const opener = messages[0];
  if (
    opener?.direction === "out" &&
    opener.from_address &&
    !boxes.has(opener.from_address) &&
    [...opener.to, ...opener.cc].some((a) => boxes.has(a.toLowerCase()))
  ) {
    opener.direction = "in";
  }
  const first = (thread.messages ?? [])[0];
  const subject = header(first?.payload, "Subject").replace(/\s+/g, " ").trim();
  return { threadId: thread.id, subject, messages };
}

/** True when someone outside the company wrote in this thread. */
export function hasInbound(thread: ParsedThread): boolean {
  return thread.messages.some((m) => m.direction === "in");
}
