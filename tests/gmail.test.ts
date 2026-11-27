import { generateKeyPairSync, createVerify } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const { createGmailClient, delegatedAssertion, allowedMailboxes } = await import("@/lib/gmail/client");

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const sa = {
  client_email: "svc@example.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  token_uri: "https://oauth2.googleapis.com/token",
};

describe("gmail client", () => {
  it("signs a delegated assertion for the mailbox", () => {
    const jwt = delegatedAssertion(sa, "box@example.com", 1000);
    const [h, c, s] = jwt.split(".");
    const claims = JSON.parse(Buffer.from(c, "base64url").toString());
    expect(claims).toMatchObject({ iss: sa.client_email, sub: "box@example.com", exp: 4600 });
    const v = createVerify("RSA-SHA256");
    v.update(`${h}.${c}`);
    expect(v.verify(publicKey, Buffer.from(s, "base64url"))).toBe(true);
  });

  it("refuses a mailbox that is not allowed", () => {
    expect(() => createGmailClient(sa, "someone@example.com", ["box@example.com"])).toThrow(/not in mail.mailboxes/);
  });

  it("reads the allowed list from settings", () => {
    expect(allowedMailboxes([{ key: "mail.mailboxes", value: ["Box@Example.com", 3] }])).toEqual(["box@example.com"]);
    expect(allowedMailboxes([])).toEqual([]);
  });
});

describe("gmail api address", () => {
  it("is Google's unless a loopback stand-in is set for the e2e tests", async () => {
    const { gmailApiBase } = await import("@/lib/gmail/client");
    expect(gmailApiBase({})).toBe("https://gmail.googleapis.com/gmail/v1/users");
    expect(gmailApiBase({ E2E_GMAIL_API: "http://127.0.0.1:3199/gmail/" })).toBe("http://127.0.0.1:3199/gmail");
    expect(gmailApiBase({ E2E_GMAIL_API: "http://localhost:3199" })).toBe("http://localhost:3199");
    for (const bad of ["https://evil.example/gmail", "http://127.0.0.1.evil.example:1/x", "http://10.0.0.5:80", "localhost:3199"]) {
      expect(gmailApiBase({ E2E_GMAIL_API: bad })).toBe("https://gmail.googleapis.com/gmail/v1/users");
    }
  });
});
