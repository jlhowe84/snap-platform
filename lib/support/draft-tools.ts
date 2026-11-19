import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { createCapturaClient } from "@/lib/captura/client";
import { matchGalleries, matchPlayers, orderSummary, playerSummary, shapeOrder } from "@/lib/captura/shape";

// The Captura lookups a drafted reply may make. All three only read, through
// the read-only client, and only the few facts a reply needs are passed on
// (lib/captura/shape.ts). Each lookup also leaves a plain line for the staff
// member, so they can see what the draft was built on.

type Captura = ReturnType<typeof createCapturaClient>;
export type DraftToolContext = { captura: Captura; customerEmail: string | null; found: string[] };

const GALLERY_PAGES = 5; // newest 500 galleries
const PAGE = 100;

export const DRAFT_TOOLS: Anthropic.Tool[] = [
  {
    name: "look_up_order",
    description:
      "Look up one Captura order by its order number (digits only, as printed on the customer's receipt). Returns payment status, what was bought, each shipment's status, carrier and tracking number, and whether the order's email matches the customer's. Only use a number that appears in the conversation.",
    input_schema: { type: "object", properties: { order_number: { type: "string", description: "Digits only" } }, required: ["order_number"], additionalProperties: false },
  },
  {
    name: "find_gallery",
    description:
      "Find Captura galleries by words in the title, such as the league name and season. Returns up to 8 with id, title, photo day and status. Use it when the galleries you were given do not cover what the customer is asking about.",
    input_schema: { type: "object", properties: { search: { type: "string", description: "Words from the gallery title" } }, required: ["search"], additionalProperties: false },
  },
  {
    name: "find_player",
    description:
      "Find a player in one gallery by name. Returns the player's team, access code, personal gallery link and expiry, and whether the player's email on file matches the customer's. Use the child's name from the conversation.",
    input_schema: {
      type: "object",
      properties: { gallery_id: { type: "string", description: "Gallery id, digits only" }, name: { type: "string", description: "The player's first and last name" } },
      required: ["gallery_id", "name"],
      additionalProperties: false,
    },
  },
];

const Order = z.object({ order_number: z.string().trim().regex(/^\d{4,14}$/) });
const Gallery = z.object({ search: z.string().trim().min(2).max(80) });
const Player = z.object({ gallery_id: z.string().trim().regex(/^\d{1,14}$/), name: z.string().trim().min(2).max(80) });

function notFound(error: unknown): boolean {
  return error instanceof Error && /\((400|404)\)$/.test(error.message);
}

export async function runDraftTool(name: string, rawInput: unknown, ctx: DraftToolContext): Promise<{ content: string; isError: boolean }> {
  try {
    if (name === "look_up_order") {
      const input = Order.safeParse(rawInput);
      if (!input.success) return { content: "An order number is 4 to 14 digits.", isError: true };
      try {
        const facts = shapeOrder(await ctx.captura.getOrder(input.data.order_number), input.data.order_number, ctx.customerEmail);
        ctx.found.push(orderSummary(facts));
        return { content: JSON.stringify(facts), isError: false };
      } catch (error) {
        if (!notFound(error)) throw error;
        ctx.found.push(`Order ${input.data.order_number}: not found in Captura.`);
        return { content: "No order with that number was found.", isError: false };
      }
    }
    if (name === "find_gallery") {
      const input = Gallery.safeParse(rawInput);
      if (!input.success) return { content: "Give 2 to 80 characters to search for.", isError: true };
      const hits = [];
      for (let page = 0; page < GALLERY_PAGES && hits.length < 8; page++) {
        const list = await ctx.captura.listGalleries({ start: page * PAGE + 1, end: (page + 1) * PAGE });
        hits.push(...matchGalleries(list, input.data.search, 8 - hits.length));
        if (!Array.isArray(list) || list.length < PAGE) break;
      }
      ctx.found.push(`Galleries matching "${input.data.search}": ${hits.length === 0 ? "none" : hits.map((h) => h.title).join("; ")}.`);
      return { content: JSON.stringify({ galleries: hits }), isError: false };
    }
    if (name === "find_player") {
      const input = Player.safeParse(rawInput);
      if (!input.success) return { content: "Give a gallery id (digits) and a name.", isError: true };
      try {
        const found = matchPlayers(await ctx.captura.getGallery(input.data.gallery_id), input.data.gallery_id, input.data.name, ctx.customerEmail);
        ctx.found.push(playerSummary(found, input.data.name));
        return { content: JSON.stringify(found), isError: false };
      } catch (error) {
        if (!notFound(error)) throw error;
        return { content: "No gallery with that id was found.", isError: false };
      }
    }
    return { content: "There is no such lookup.", isError: true };
  } catch {
    // Captura's own error text is not passed on.
    ctx.found.push("A Captura lookup failed.");
    return { content: "The lookup failed. Leave a note in square brackets for the staff member instead.", isError: true };
  }
}
