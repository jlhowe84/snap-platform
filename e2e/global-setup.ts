import { execFileSync, execSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { admin, COMPANY_ID, PASSWORD, sessionCookies, USERS, type Who } from "./helpers";
import { FAKE_GMAIL, startFakeGmail } from "./fake-gmail";

// Creates the test users (their staff invites in e2e/fixtures/seed.sql give
// them their roles) and saves a signed-in browser state for each.
export default async function globalSetup() {
  // Every run starts from a clean database (E2E_SKIP_RESET=1 skips it while
  // writing a test). The keys stay the same across resets.
  if (process.env.E2E_SKIP_RESET !== "1") execSync("scripts/e2e-db.sh", { stdio: "inherit" });
  // A throwaway Workspace key whose token address is the fake Gmail.
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const key = JSON.stringify({
    client_email: "e2e@e2e.test",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    token_uri: `${FAKE_GMAIL}/token`,
  });
  execFileSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-v", `sa=${key}`, "postgresql://postgres:postgres@127.0.0.1:54322/postgres"], {
    input: `select private.set_integration_secret('${COMPANY_ID}', 'google_workspace', :'sa');`,
  });
  const gmail = await startFakeGmail();

  const db = admin();
  const { data: existing } = await db.auth.admin.listUsers();
  mkdirSync("e2e/.auth", { recursive: true });
  for (const who of Object.keys(USERS) as Who[]) {
    const u = USERS[who];
    if (!existing?.users.some((x) => x.email === u.email)) {
      const { error } = await db.auth.admin.createUser({
        email: u.email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: u.name },
      });
      if (error) throw new Error(`could not create ${who}: ${error.message}`);
    }
    const cookies = await sessionCookies(who);
    writeFileSync(`e2e/.auth/${who}.json`, JSON.stringify({ cookies, origins: [] }));
  }
  // The crew test user is the crew member Casey Crew.
  const { data: crewUser } = await db.from("profiles").select("id").eq("email", USERS.crew.email).single();
  await db.from("crew_members").update({ profile_id: crewUser!.id }).eq("email", USERS.crew.email);
  return () => new Promise<void>((resolve) => gmail.close(() => resolve()));
}
