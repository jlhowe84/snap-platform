// Saved replies can hold a few blanks that are filled in when one is put into
// the reply box. Unknown blanks are left as written so nobody sends a reply
// with a silent gap.

export const SAVED_REPLY_BLANKS = ["{first_name}", "{my_name}"] as const;

export function firstNameOf(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  // An address or a company name is not a first name.
  return /^[\p{L}'-]{2,30}$/u.test(first) ? first : "";
}

export function fillSavedReply(body: string, who: { customerName?: string | null; myName?: string | null }): string {
  const first = firstNameOf(who.customerName) || "there";
  const mine = firstNameOf(who.myName);
  return body.replaceAll("{first_name}", first).replaceAll("{my_name}", mine || "{my_name}");
}
