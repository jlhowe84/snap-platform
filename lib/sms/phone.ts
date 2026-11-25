// US mobile numbers for crew texts, stored as +1 and ten digits. People type
// numbers every way ("(215) 555-0142", "215.555.0142", "1 215 555 0142");
// anything that is not a plain US number is refused rather than guessed.

/** The +1 form of a US number, or null when it is not one. */
export function toUsMobile(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw || /[a-z]/i.test(raw)) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  // Area codes and exchanges never start with 0 or 1.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
  return `+1${digits}`;
}

/** (215) 555-0142 for a stored +1 number; anything else comes back as is. */
export function formatUsMobile(e164: string | null | undefined): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164 ?? "");
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (e164 ?? "");
}
