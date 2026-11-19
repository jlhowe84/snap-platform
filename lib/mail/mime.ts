// Builds the plain-text message Gmail's send endpoint takes. Pure, so it can
// be tested without a mailbox.

export type PlainMail = {
  from: string;
  to: string[];
  subject: string;
  body: string;
  /** The Message-ID this answers, so the reply joins the other person's thread. */
  inReplyTo?: string | null;
};

const MESSAGE_ID = /^<[^<>\s]{3,240}>$/;

/** A Message-ID header value we are willing to echo back, or null. */
export function cleanMessageId(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return MESSAGE_ID.test(v) ? v : null;
}

/** "Re: subject", without stacking a second "Re:". */
export function replySubject(subject: string) {
  const clean = subject.replace(/[\r\n]+/g, " ").trim() || "(no subject)";
  return /^re:/i.test(clean) ? clean : `Re: ${clean}`;
}

const ADDRESS = /^[^\s<>(),;:"\\@]+@[^\s<>(),;:"\\@]+\.[^\s<>(),;:"\\@]+$/;

export function isPlainAddress(value: string) {
  return value.length <= 254 && ADDRESS.test(value);
}

/** RFC 2047 encoded-words, so a subject with any character survives. */
function encodeHeader(value: string) {
  const clean = value.replace(/[\r\n]+/g, " ").trim();
  if (/^[\x20-\x7e]*$/.test(clean)) return clean;
  const words: string[] = [];
  let chunk = "";
  for (const ch of clean) {
    if (Buffer.byteLength(chunk + ch, "utf8") > 45) {
      words.push(chunk);
      chunk = "";
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, "utf8").toString("base64")}?=`).join("\r\n ");
}

/** The message as RFC 822 text. Throws on an address that is not a plain address. */
export function buildMime(mail: PlainMail) {
  const everyone = [mail.from, ...mail.to];
  const bad = everyone.find((a) => !isPlainAddress(a));
  if (bad !== undefined || mail.to.length === 0) throw new Error("A message needs a sender and at least one plain address.");
  const body = Buffer.from(mail.body.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
  const answers = cleanMessageId(mail.inReplyTo);
  return [
    `From: ${mail.from}`,
    `To: ${mail.to.join(", ")}`,
    `Subject: ${encodeHeader(mail.subject)}`,
    ...(answers ? [`In-Reply-To: ${answers}`, `References: ${answers}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    body,
  ].join("\r\n");
}

export function toRaw(mime: string) {
  return Buffer.from(mime, "utf8").toString("base64url");
}
