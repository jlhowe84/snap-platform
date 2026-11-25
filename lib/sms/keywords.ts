// The reply words carriers treat as opt-out and opt-in. The carrier answers
// them itself; the platform only records the new answer.

const STOP = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "REVOKE"]);
const START = new Set(["START", "UNSTOP", "YES", "OPTIN"]);

export function replyIntent(body: string | null | undefined): "stop" | "start" | null {
  const word = (body ?? "").trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (STOP.has(word)) return "stop";
  if (START.has(word)) return "start";
  return null;
}
