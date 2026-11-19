"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseKnowledgeMarkdown } from "@/lib/kb/import";
import { KB_SHELVES, KB_STATUSES } from "@/lib/kb/labels";

// The knowledge base. Office staff write; RLS says the same, and the database
// stamps who changed what and keeps every earlier version.

export type KbState = { ok: boolean; message: string } | null;

const Article = z.object({
  title: z.string().trim().min(1).max(200),
  section: z.string().trim().max(120),
  shelf: z.enum(KB_SHELVES),
  status: z.enum(KB_STATUSES),
  body: z.string().trim().min(1).max(20000),
});

export async function saveArticle(id: string | null, _prev: KbState, form: FormData): Promise<KbState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  const parsed = Article.safeParse({
    title: form.get("title"),
    section: form.get("section") ?? "",
    shelf: form.get("shelf"),
    status: form.get("status"),
    body: form.get("body"),
  });
  if (!parsed.success) return { ok: false, message: "An article needs a title, a shelf and some text." };
  const row = { ...parsed.data, section: parsed.data.section || null };
  const supabase = await createClient();
  if (id) {
    const articleId = z.uuid().safeParse(id);
    if (!articleId.success) return { ok: false, message: "That article was not found." };
    const { data, error } = await supabase.from("kb_articles").update(row).eq("id", articleId.data).select("id, version");
    if (error || !data?.length) return { ok: false, message: "Could not save. Try again." };
    revalidatePath("/knowledge");
    revalidatePath(`/knowledge/${articleId.data}`);
    return { ok: true, message: `Saved as version ${data[0].version}.` };
  }
  const { data, error } = await supabase
    .from("kb_articles")
    .insert({ ...row, company_id: viewer.companyId!, created_by: viewer.id })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: "Could not save. Try again." };
  revalidatePath("/knowledge");
  redirect(`/knowledge/${data.id}`);
}

const Import = z.object({
  markdown: z.string().min(1).max(400_000),
  skip: z.string().max(500),
  status: z.enum(["published", "draft"]),
});

/**
 * Adds every article in a Markdown document. An article whose shelf, section
 * and title are already in the knowledge base is left alone, so importing the
 * same document twice adds nothing.
 */
export async function importArticles(_prev: KbState, form: FormData): Promise<KbState> {
  const viewer = await requireStaff(OFFICE_ROLES);
  const parsed = Import.safeParse({ markdown: form.get("markdown"), skip: form.get("skip") ?? "", status: form.get("status") });
  if (!parsed.success) return { ok: false, message: "Paste the document's text first." };
  const skipSections = parsed.data.skip.split(",").map((s) => s.trim()).filter(Boolean);
  const articles = parseKnowledgeMarkdown(parsed.data.markdown, { skipSections });
  if (articles.length === 0) return { ok: false, message: "No sections were found. Each section needs a line starting with ##." };

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase.from("kb_articles").select("shelf, section, title").neq("status", "retired");
  if (readError) return { ok: false, message: "Could not read the knowledge base. Try again." };
  const key = (a: { shelf: string; section: string | null; title: string }) => `${a.shelf}\u0000${(a.section ?? "").toLowerCase()}\u0000${a.title.toLowerCase()}`;
  const have = new Set((existing ?? []).map(key));
  const fresh = articles.filter((a) => !have.has(key(a)));
  if (fresh.length === 0) return { ok: true, message: `All ${articles.length} articles are already here. Nothing was added.` };

  const { error } = await supabase.from("kb_articles").insert(
    fresh.map((a) => ({
      company_id: viewer.companyId!,
      shelf: a.shelf,
      section: a.section,
      title: a.title,
      body: a.body,
      position: a.position,
      status: parsed.data.status,
      created_by: viewer.id,
    })),
  );
  if (error) return { ok: false, message: "Could not import. Nothing was added." };
  revalidatePath("/knowledge");
  const skipped = articles.length - fresh.length;
  return {
    ok: true,
    message: `Added ${fresh.length} ${fresh.length === 1 ? "article" : "articles"}${skipped ? `; ${skipped} were already here` : ""}.`,
  };
}
