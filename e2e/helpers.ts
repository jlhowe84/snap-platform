import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

// Shared by the e2e setup and specs. Only ever points at the local Supabase
// from scripts/e2e-db.sh; refuses anything that is not 127.0.0.1/localhost.
export const COMPANY_ID = "e2e00000-0000-4000-8000-000000000001";
export const PASSWORD = "e2e-password-not-secret";
export const USERS = {
  owner: { email: "owner@e2e.test", name: "Olive Owner" },
  office: { email: "office@e2e.test", name: "Oscar Office" },
  crew: { email: "crew@e2e.test", name: "Casey Crew" },
} as const;
export type Who = keyof typeof USERS;

export function localUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
    throw new Error(`e2e tests only run against a local Supabase, not ${url || "(unset)"}. Run scripts/e2e-db.sh first.`);
  }
  return url;
}

/** Service-role client for arranging and checking test data. */
export function admin() {
  return createClient(localUrl(), process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Signs a test user in and returns the auth cookies the app reads. */
export async function sessionCookies(who: Who) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(localUrl(), process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar,
      setAll: (list) => {
        for (const c of list) {
          const i = jar.findIndex((j) => j.name === c.name);
          if (i >= 0) jar.splice(i, 1);
          if (c.value) jar.push({ name: c.name, value: c.value });
        }
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email: USERS[who].email, password: PASSWORD });
  if (error) throw new Error(`sign-in failed for ${who}: ${error.message}`);
  return jar.map((c) => ({
    name: c.name,
    value: c.value,
    domain: "localhost",
    path: "/",
    httpOnly: false,
    secure: false,
    sameSite: "Lax" as const,
    expires: Math.floor(Date.now() / 1000) + 3600,
  }));
}
