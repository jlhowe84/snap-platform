// Text messages are kept to the GSM character set (no emoji, no curly quotes,
// no long dashes): one character outside it switches the whole message to a
// wider encoding and a segment drops from 160 characters to 70.

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€";
const GSM = new Set([...GSM_BASIC, ...GSM_EXTENDED]);

const SWAPS: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "“": '"', "”": '"', "„": '"',
  "–": "-", "—": "-", "…": "...", " ": " ", "•": "-", "·": "-",
};

/** The text with common typographic characters made plain and anything else outside GSM dropped. */
export function toGsm(text: string): string {
  let out = "";
  for (const ch of text) {
    const swapped = SWAPS[ch] ?? ch;
    for (const c of swapped) if (GSM.has(c)) out += c;
  }
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

/** Characters a GSM message counts (the extended ones take two). */
export function gsmLength(text: string): number {
  let n = 0;
  for (const ch of text) n += GSM_EXTENDED.includes(ch) ? 2 : 1;
  return n;
}

/** How many segments a GSM message is billed as. */
export function segments(text: string): number {
  const n = gsmLength(text);
  return n <= 160 ? 1 : Math.ceil(n / 153);
}
