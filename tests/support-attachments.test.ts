import { describe, expect, it } from "vitest";
import type { GmailPart } from "@/lib/gmail/client";
import { attachmentsOf, isPartId, parseThread } from "@/lib/support/parse";
import { formatSize, readAttachments, showsInPlace } from "@/lib/support/files";

const text = (data: string): GmailPart => ({ partId: "0", mimeType: "text/plain", body: { data: Buffer.from(data).toString("base64url"), size: data.length } });
const file = (partId: string, mimeType: string, filename: string, size: number, headers: GmailPart["headers"] = []): GmailPart => ({
  partId, mimeType, filename, headers, body: { attachmentId: `key-${partId}`, size },
});

describe("attachmentsOf", () => {
  it("lists attached files and pictures placed in the text", () => {
    const payload: GmailPart = {
      mimeType: "multipart/mixed",
      parts: [
        { partId: "0", mimeType: "multipart/related", parts: [
          text("See the photo"),
          file("0.1", "image/jpeg", "", 250_000, [{ name: "Content-ID", value: "<a1>" }]),
        ] },
        file("1", "application/pdf", "order.pdf", 80_000, [{ name: "Content-Disposition", value: 'attachment; filename="order.pdf"' }]),
        file("2", "IMAGE/PNG", "team/photo\n.png", 1_200_000, [{ name: "Content-Disposition", value: "attachment" }]),
      ],
    };
    expect(attachmentsOf(payload)).toEqual([
      { part: "0.1", name: "image-1.jpg", type: "image/jpeg", size: 250_000, inline: true },
      { part: "1", name: "order.pdf", type: "application/pdf", size: 80_000, inline: false },
      { part: "2", name: "team photo .png", type: "image/png", size: 1_200_000, inline: false },
    ]);
  });
  it("leaves out tracking dots, signatures, nameless files and the message text", () => {
    const payload: GmailPart = {
      mimeType: "multipart/mixed",
      parts: [
        text("hello"),
        file("1", "image/gif", "", 43, [{ name: "Content-ID", value: "<dot>" }]),
        file("2", "application/pkcs7-signature", "smime.p7s", 4_000),
        file("3", "application/octet-stream", "", 9_000),
        file("x", "image/png", "bad-part.png", 9_000),
        { partId: "5", mimeType: "image/png", filename: "empty.png", body: { attachmentId: "k", size: 0 } },
      ],
    };
    expect(attachmentsOf(payload)).toEqual([]);
    expect(attachmentsOf(undefined)).toEqual([]);
  });
  it("comes through on each parsed message", () => {
    const thread = parseThread(
      { id: "t1", messages: [{ id: "m1", threadId: "t1", internalDate: "1795000000000", payload: {
        mimeType: "multipart/mixed",
        headers: [{ name: "From", value: "Pat <pat@example.org>" }, { name: "Subject", value: "Photo" }],
        parts: [text("hi"), file("1", "image/jpeg", "kid.jpg", 500_000)],
      } }] },
      ["help@example.com"],
    );
    expect(thread.messages[0].attachments).toEqual([{ part: "1", name: "kid.jpg", type: "image/jpeg", size: 500_000, inline: false }]);
  });
});

describe("attachment rules", () => {
  it("accepts only the mailbox's part numbers", () => {
    expect(isPartId("0")).toBe(true);
    expect(isPartId("1.2.3")).toBe(true);
    expect(isPartId("")).toBe(false);
    expect(isPartId("1..2")).toBe(false);
    expect(isPartId("../1")).toBe(false);
    expect(isPartId("1".repeat(21))).toBe(false);
  });
  it("shows photos and PDFs in place and downloads the rest", () => {
    expect(showsInPlace("image/jpeg")).toBe(true);
    expect(showsInPlace("application/pdf")).toBe(true);
    expect(showsInPlace("image/svg+xml")).toBe(false);
    expect(showsInPlace("text/html")).toBe(false);
  });
  it("reads a stored list and drops what is not a file", () => {
    expect(readAttachments(null)).toEqual([]);
    expect(readAttachments([{ part: "1", name: "a.pdf", type: "application/pdf", size: 10, inline: false }, { part: 1 }, "x"])).toHaveLength(1);
  });
  it("words a size", () => {
    expect(formatSize(900)).toBe("900 B");
    expect(formatSize(20_480)).toBe("20 KB");
    expect(formatSize(3_500_000)).toBe("3.3 MB");
  });
});
