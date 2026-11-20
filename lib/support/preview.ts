// Small helpers for the support inbox list: a first line of the customer's
// message, and how long a conversation has been waiting on us.

/** The opening of a message for a list: no quoted reply, no greeting line, one line. */
export function messagePreview(body: string | null | undefined, max = 140): string {
  if (!body) return "";
  const lines: string[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    // Everything under "On ... wrote:" or a quoted line is the earlier message.
    if (/^on .+ wrote:$/i.test(line) || /^-{2,}\s*(original|forwarded) message/i.test(line)) break;
    if (!line || line.startsWith(">")) continue;
    lines.push(line);
  }
  // A bare greeting ("Hi," or "Hello SNAP team,") says nothing in a list.
  if (lines.length > 1 && /^(hi|hello|hey|good (morning|afternoon|evening)|dear)\b[^.?!]{0,40}[,!]?$/i.test(lines[0])) lines.shift();
  const text = lines.join(" ").replace(/\s+/g, " ");
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export type Waiting = { label: string; tone: "muted" | "warn" | "risk" };

/** How long since the customer last wrote: quiet under a day, amber to three days, red after. */
export function waitingSince(lastInboundIso: string | null | undefined, now: Date = new Date()): Waiting | null {
  if (!lastInboundIso) return null;
  const hours = (now.getTime() - new Date(lastInboundIso).getTime()) / 3_600_000;
  if (!Number.isFinite(hours) || hours < 0) return null;
  if (hours < 1) return { label: "Waiting under an hour", tone: "muted" };
  if (hours < 24) {
    const h = Math.floor(hours);
    return { label: `Waiting ${h} hour${h === 1 ? "" : "s"}`, tone: "muted" };
  }
  const d = Math.floor(hours / 24);
  return { label: `Waiting ${d} day${d === 1 ? "" : "s"}`, tone: d >= 3 ? "risk" : "warn" };
}

/** A search term made safe to place inside a filter: letters, digits and a few marks only. */
export function searchTerm(q: string | undefined): string {
  return (q ?? "").replace(/[^\p{L}\p{N} @._'-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}
