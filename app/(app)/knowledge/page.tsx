import type { Metadata } from "next";
import Link from "next/link";
import { OFFICE_ROLES, hasAnyRole, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill, cx } from "@/components/ui";
import { SUPPORT_ROLES } from "@/lib/support/labels";
import { KB_SHELVES, SHELF_HINT, SHELF_LABEL, isShelf, type KbShelf } from "@/lib/kb/labels";
import { searchTerm } from "@/lib/lab/costs";

export const metadata: Metadata = { title: "Knowledge base" };

type Row = { id: string; shelf: KbShelf; section: string | null; title: string; status: string; position: number };

export default async function KnowledgePage({ searchParams }: PageProps<"/knowledge">) {
  const viewer = await requireStaff(SUPPORT_ROLES);
  const canEdit = hasAnyRole(viewer, OFFICE_ROLES);
  const sp = await searchParams;
  const q = searchTerm(typeof sp.q === "string" ? sp.q : undefined);
  const retired = sp.show === "retired";
  const shelf: KbShelf | null = isShelf(sp.shelf) ? sp.shelf : q || retired ? null : "answers";

  const supabase = await createClient();
  let query = supabase.from("kb_articles").select("id, shelf, section, title, status, position").order("position").order("title").limit(500);
  query = retired ? query.eq("status", "retired") : query.neq("status", "retired");
  if (shelf) query = query.eq("shelf", shelf);
  if (q) query = query.textSearch("search", q, { type: "websearch", config: "english" });
  const [{ data }, { data: counts }] = await Promise.all([query, supabase.from("kb_articles").select("shelf").neq("status", "retired")]);
  const rows = (data ?? []) as Row[];
  const perShelf = new Map<string, number>();
  for (const c of counts ?? []) perShelf.set(c.shelf, (perShelf.get(c.shelf) ?? 0) + 1);

  const sections = new Map<string, Row[]>();
  for (const r of rows) {
    const key = q ? `${SHELF_LABEL[r.shelf]}${r.section ? ` · ${r.section}` : ""}` : (r.section ?? "Other");
    sections.set(key, [...(sections.get(key) ?? []), r]);
  }
  const tab = (active: boolean) =>
    cx("rounded-lg border px-3 py-1.5 text-sm font-medium", active ? "border-accent bg-accent text-accent-ink" : "border-line text-muted hover:border-accent hover:text-accent");

  return (
    <>
      <PageHeader eyebrow="Knowledge" title="Knowledge base">
        {canEdit && (
          <>
            <Link href="/knowledge/import" className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:border-accent hover:text-accent">
              Import
            </Link>
            <Link href={`/knowledge/new${shelf ? `?shelf=${shelf}` : ""}`} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink hover:brightness-110">
              New article
            </Link>
          </>
        )}
      </PageHeader>

      <form className="mb-4 flex max-w-xl gap-2" action="/knowledge">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search every shelf, for example: rain, gallery link, retake"
          className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm"
        />
        <button className="rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:border-accent hover:text-accent">Search</button>
      </form>

      <nav className="mb-2 flex flex-wrap gap-2" aria-label="Shelf">
        {KB_SHELVES.map((s) => (
          <Link key={s} href={`/knowledge?shelf=${s}`} aria-current={s === shelf && !q ? "page" : undefined} className={tab(s === shelf && !q && !retired)}>
            {SHELF_LABEL[s]} <span className="opacity-70">{perShelf.get(s) ?? 0}</span>
          </Link>
        ))}
        <Link href="/knowledge?show=retired" className={tab(retired)}>Retired</Link>
      </nav>
      <p className="mb-6 text-sm text-muted">
        {q ? `Articles that mention "${q}".` : retired ? "Articles taken out of use. Their wording is kept." : shelf ? SHELF_HINT[shelf] : ""}
      </p>

      {rows.length === 0 ? (
        <Card>
          <Empty>
            {q ? "Nothing matches. Try fewer or different words." : canEdit ? "No articles here yet. Add one, or import the customer service document." : "No articles here yet."}
          </Empty>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {[...sections].map(([section, items]) => (
            <Card key={section} title={section}>
              <ul className="divide-y divide-line">
                {items.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                    <Link href={`/knowledge/${a.id}`} className="text-sm font-medium hover:text-accent">{a.title}</Link>
                    {a.status === "draft" && <Pill tone="warn">Draft</Pill>}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
