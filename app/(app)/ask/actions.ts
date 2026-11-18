"use server";

import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { askSnap, type AskResult } from "@/lib/ask/run";
import { ASK_ROLES } from "@/lib/ask/roles";

const Input = z.object({
  question: z.string().trim().min(1).max(2000),
  history: z.array(z.object({ question: z.string().max(2000), answer: z.string().max(20000) })).max(12),
});

export async function ask(question: string, history: { question: string; answer: string }[]): Promise<AskResult> {
  const viewer = await requireStaff(ASK_ROLES);
  const parsed = Input.safeParse({ question, history });
  if (!parsed.success) return { ok: false, message: "Ask a question of up to 2,000 characters." };
  return askSnap(viewer, parsed.data.question, parsed.data.history);
}
