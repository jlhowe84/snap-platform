// A contact's email field sometimes holds more than one address ("a@x.org;
// b@y.org"), mostly from the Notion import. Everything that sends mail or
// matches a recipient goes through here so each address stands on its own.

export function splitAddresses(field: string | null | undefined): string[] {
  if (!field) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of field.split(/[;,\s]+/)) {
    const address = part.trim().replace(/^<|>$/g, "");
    if (!address.includes("@")) continue;
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(address);
  }
  return out;
}

/** The address a portal link signs in with: the first one in the field. */
export function firstAddress(field: string | null | undefined): string | null {
  return splitAddresses(field)[0] ?? null;
}

/** Every address across several contacts, in order, with no repeats. */
export function addressesOf(contacts: { email: string | null }[]): string[] {
  return splitAddresses(contacts.map((c) => c.email ?? "").join(";"));
}

/** True when any address in the field is one of the wanted addresses. */
export function fieldHasAddress(field: string | null | undefined, wanted: Iterable<string>): boolean {
  const set = new Set([...wanted].map((a) => a.trim().toLowerCase()));
  return splitAddresses(field).some((a) => set.has(a.toLowerCase()));
}
