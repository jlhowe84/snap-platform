import { createClient } from "@/lib/supabase/server";
import { fetchAttachment } from "@/lib/support/attachments";
import { readAttachments, showsInPlace } from "@/lib/support/files";
import { isPartId } from "@/lib/support/parse";

// One file that came with a support message. The person's own session reads
// the message row, so the database decides who may open it (support staff of
// the same company). Only files listed on that row can be asked for.
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const missing = () => new Response("Not found", { status: 404 });

export async function GET(_req: Request, ctx: RouteContext<"/support/attachment/[messageId]/[part]">) {
  const { messageId, part } = await ctx.params;
  if (!UUID.test(messageId) || !isPartId(part)) return missing();

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("support_messages")
    .select("company_id, gmail_message_id, attachments, support_conversations(mailbox)")
    .eq("id", messageId)
    .maybeSingle();
  const file = readAttachments(row?.attachments).find((a) => a.part === part);
  const mailbox = (row?.support_conversations as { mailbox: string } | null)?.mailbox;
  if (!row || !row.gmail_message_id || !file || !mailbox) return missing();

  let bytes: Uint8Array | null;
  try {
    bytes = await fetchAttachment({ companyId: row.company_id, mailbox, gmailMessageId: row.gmail_message_id, part });
  } catch {
    return new Response("The file could not be read from the mailbox. Try again in a moment.", { status: 502 });
  }
  if (!bytes) return missing();

  const inPlace = showsInPlace(file.type);
  const safeName = file.name.replace(/[^\w .()-]/g, "_");
  // Sent in pieces so a large photo is not held to the size limit of a single response.
  const CHUNK = 256 * 1024;
  let at = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (at >= bytes.length) return controller.close();
      controller.enqueue(bytes.subarray(at, at + CHUNK));
      at += CHUNK;
    },
  });
  return new Response(body, {
    headers: {
      "content-type": inPlace ? file.type : "application/octet-stream",
      "content-disposition": `${inPlace ? "inline" : "attachment"}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "x-content-type-options": "nosniff",
      // A file from outside may not run anything or reach anything.
      "content-security-policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
      "cache-control": "private, max-age=3600",
    },
  });
}
