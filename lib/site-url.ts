// The address to put in a link that leaves the app in a message: an email, a
// notice, a text. Those links must open the live site, not whichever preview
// build happened to draft the message.

type HeaderBag = { get(name: string): string | null };

/**
 * The live site's address. On Vercel this is the project's production domain
 * (set on every deployment, previews included). Anywhere else, such as local
 * development, it falls back to the address of the request.
 */
export function liveSiteUrl(headers: HeaderBag, env: Record<string, string | undefined> = process.env): string {
  const live = env.VERCEL_PROJECT_PRODUCTION_URL?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (live) return `https://${live}`;
  return `${headers.get("x-forwarded-proto") ?? "https"}://${headers.get("x-forwarded-host") ?? headers.get("host")}`;
}
