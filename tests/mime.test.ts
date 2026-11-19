import { describe, expect, it } from "vitest";
import { buildMime, isPlainAddress, toRaw } from "@/lib/mail/mime";

describe("mime", () => {
  const mail = { from: "box@example.com", to: ["a@example.com"], subject: "Hello", body: "Line one\nLine two" };

  it("builds a plain text message", () => {
    const mime = buildMime(mail);
    expect(mime).toContain("From: box@example.com\r\nTo: a@example.com\r\nSubject: Hello\r\n");
    const body = mime.split("\r\n\r\n")[1].replace(/\r\n/g, "");
    expect(Buffer.from(body, "base64").toString()).toBe("Line one\r\nLine two");
  });

  it("keeps a line break out of the subject", () => {
    const mime = buildMime({ ...mail, subject: "Hi\r\nBcc: other@example.com" });
    expect(mime).toContain("Subject: Hi Bcc: other@example.com\r\n");
    expect(mime.split("\r\n").filter((l) => l.startsWith("Bcc:"))).toHaveLength(0);
  });

  it("encodes a subject that is not plain ASCII", () => {
    const mime = buildMime({ ...mail, subject: "Año nuevo: día de fotos" });
    const line = mime.split("\r\n").find((l) => l.startsWith("Subject:"))!;
    expect(line).toMatch(/^Subject: =\?UTF-8\?B\?/);
  });

  it("refuses anything that is not a plain address", () => {
    expect(isPlainAddress("a@example.com")).toBe(true);
    for (const bad of ["a@example.com, b@example.com", "A <a@example.com>", "a@example.com\r\nBcc: x@y.z", "nobody"]) {
      expect(isPlainAddress(bad)).toBe(false);
      expect(() => buildMime({ ...mail, to: [bad] })).toThrow();
    }
    expect(() => buildMime({ ...mail, to: [] })).toThrow();
  });

  it("encodes for the Gmail API", () => {
    expect(Buffer.from(toRaw(buildMime(mail)), "base64url").toString()).toBe(buildMime(mail));
  });
});
