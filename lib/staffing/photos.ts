import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// Crew photos live in a private bucket with no policies. The server makes
// short links for people who have already passed an RLS read of the profile.
export const CREW_PHOTO_BUCKET = "crew-photos";

/** One-hour links for the given photo paths, keyed by path. Empty when storage is not set up. */
export async function crewPhotoUrls(paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const list = [...new Set(paths.filter((p): p is string => !!p))];
  const out = new Map<string, string>();
  if (!list.length) return out;
  try {
    const { data } = await createAdminClient().storage.from(CREW_PHOTO_BUCKET).createSignedUrls(list, 3600);
    for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  } catch {
    // No service key in this environment: show initials instead.
  }
  return out;
}
