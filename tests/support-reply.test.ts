import { describe, expect, it } from "vitest";
import { buildMime, cleanMessageId, replySubject } from "@/lib/mail/mime";
import { fillSavedReply, firstNameOf } from "@/lib/support/saved";

describe("support replies", () => {
  it("adds Re: once", () => {
    expect(replySubject("Where is my order")).toBe("Re: Where is my order");
    expect(replySubject("RE: Where is my order")).toBe("RE: Where is my order");
    expect(replySubject("  ")).toBe("Re: (no subject)");
  });

  it("only echoes a well-formed Message-ID", () => {
    expect(cleanMessageId(" <abc123@mail.example> ")).toBe("<abc123@mail.example>");
    expect(cleanMessageId("<a@b>\r\nBcc: x@y.org")).toBeNull();
    expect(cleanMessageId("abc")).toBeNull();
    expect(cleanMessageId(null)).toBeNull();
  });

  it("threads a reply with In-Reply-To and References", () => {
    const mime = buildMime({ from: "help@example.com", to: ["pat@example.org"], subject: "Re: Hi", body: "Hello", inReplyTo: "<abc123@mail.example>" });
    expect(mime).toContain("In-Reply-To: <abc123@mail.example>\r\nReferences: <abc123@mail.example>");
    const plain = buildMime({ from: "help@example.com", to: ["pat@example.org"], subject: "Hi", body: "Hello", inReplyTo: "bad\r\nBcc: x@y.org" });
    expect(plain).not.toContain("In-Reply-To");
    expect(plain).not.toContain("Bcc");
  });

  it("fills the blanks in a saved reply", () => {
    expect(fillSavedReply("Hi {first_name},\nThanks, {my_name}", { customerName: "Pat Parent", myName: "Alisa Smith" })).toBe("Hi Pat,\nThanks, Alisa");
    expect(fillSavedReply("Hi {first_name}", { customerName: "pat@example.org" })).toBe("Hi there");
    expect(fillSavedReply("From {my_name}", {})).toBe("From {my_name}");
    expect(firstNameOf("  O'Neil-Smith Jr ")).toBe("O'Neil-Smith");
  });
});
