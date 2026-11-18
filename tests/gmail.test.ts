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
