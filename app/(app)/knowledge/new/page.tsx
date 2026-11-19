import type { Metadata } from "next";
import Link from "next/link";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui";
import { isShelf } from "@/lib/kb/labels";
import { ArticleForm } from "../forms";

export const metadata: Metadata = { title: "New article" };

export default async function NewArticlePage({ searchParams }: PageProps<"/knowledge/new">) {
  await requireStaff(OFFICE_ROLES);
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("kb_articles").select("section").not("section", "is", null);
  const sections = [...new Set((data ?? []).map((r) => r.section!).filter(Boolean))].sort();
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/knowledge" className="text-muted hover:text-accent">← Knowledge base</Link>
      </p>
      <PageHeader eyebrow="Knowledge" title="New article" />
      <Card>
        <ArticleForm sections={sections} shelf={isShelf(sp.shelf) ? sp.shelf : undefined} />
      </Card>
    </>
  );
}
