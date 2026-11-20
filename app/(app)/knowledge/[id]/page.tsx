import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { OFFICE_ROLES, hasAnyRole, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Pill } from "@/components/ui";
import { KbText } from "@/components/kb-text";
import { SUPPORT_ROLES } from "@/lib/support/labels";
import { SHELF_LABEL, STATUS_LABEL, type KbShelf, type KbStatus } from "@/lib/kb/labels";
import { ArticleForm } from "../forms";
import { setOnHelpCenter } from "../actions";
import { SLOT_PATTERN } from "@/lib/kb/labels";

export const metadata: Metadata = { title: "Article" };

export default async function ArticlePage({ params }: PageProps<"/knowledge/[id]">) {
  const viewer = await requireStaff(SUPPORT_ROLES);
  const { id } = await params;
  const articleId = z.uuid().safeParse(id);
  if (!articleId.success) notFound();
  const supabase = await createClient();
  const [{ data: a }, { data: versions }, { data: sectionRows }] = await Promise.all([
    supabase.from("kb_articles").select("id, shelf, section, title, body, status, version, updated_at, updated_by, on_help_center").eq("id", articleId.data).maybeSingle(),
    supabase.from("kb_article_versions").select("version, title, body, status, edited_at, edited_by").eq("article_id", articleId.data).order("version", { ascending: false }),
    supabase.from("kb_articles").select("section").not("section", "is", null),
  ]);
  if (!a) notFound();
  const canEdit = hasAnyRole(viewer, OFFICE_ROLES);
  const people = [...new Set([a.updated_by, ...(versions ?? []).map((v) => v.edited_by)].filter((x): x is string => !!x))];
  const { data: profiles } = people.length ? await supabase.from("profiles").select("id, full_name").in("id", people) : { data: [] };
  const nameOf = (pid: string | null) => (pid ? profiles?.find((p) => p.id === pid)?.full_name ?? "Staff" : "Import");
  const when = new Intl.DateTimeFormat("en-US", { timeZone: viewer.timeZone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const sections = [...new Set((sectionRows ?? []).map((r) => r.section!).filter(Boolean))].sort();

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/knowledge?shelf=${a.shelf}`} className="text-muted hover:text-accent">← {SHELF_LABEL[a.shelf as KbShelf]}</Link>
      </p>
      <PageHeader eyebrow={a.section ?? SHELF_LABEL[a.shelf as KbShelf]} title={a.title} />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted">
        <Pill tone={a.status === "published" ? "ok" : "warn"}>{STATUS_LABEL[a.status as KbStatus]}</Pill>
        <span>Version {a.version}, {when.format(new Date(a.updated_at))} by {nameOf(a.updated_by)}</span>
        {a.shelf === "answers" && a.on_help_center && <Pill tone="ok">On the help center</Pill>}
      </div>
      {canEdit && a.shelf === "answers" && (
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          {a.on_help_center ? (
            <form action={setOnHelpCenter.bind(null, a.id, false)}>
              <button className="rounded-lg border border-line px-3 py-1.5 hover:border-accent">Take off the help center</button>
            </form>
          ) : a.status !== "published" ? (
            <span className="text-muted">Publish this answer before it can go on the parent help center.</span>
          ) : SLOT_PATTERN.test(a.body) ? (
            <span className="text-muted">This answer has a [SLOT] for staff to fill in, so it cannot go on the parent help center.</span>
          ) : (
            <form action={setOnHelpCenter.bind(null, a.id, true)}>
              <button className="rounded-lg border border-line px-3 py-1.5 hover:border-accent">Show on the parent help center</button>
            </form>
          )}
          {viewer.companySlug && (
            <a href={`/help/${viewer.companySlug}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">Open the help center</a>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <KbText body={a.body} />
          </Card>
          {canEdit && (
            <Card>
              <details>
                <summary className="cursor-pointer text-sm font-semibold">Edit this article</summary>
                <div className="mt-4">
                  <ArticleForm
                    article={{ id: a.id, title: a.title, section: a.section, shelf: a.shelf as KbShelf, status: a.status as KbStatus, body: a.body }}
                    sections={sections}
                  />
                </div>
              </details>
            </Card>
          )}
        </div>
        <Card title="Earlier versions">
          {(versions ?? []).length <= 1 ? (
            <p className="text-sm text-muted">This is the first version.</p>
          ) : (
            <ul className="space-y-3">
              {(versions ?? []).slice(1).map((v) => (
                <li key={v.version}>
                  <details>
                    <summary className="cursor-pointer text-sm">
                      Version {v.version} · {when.format(new Date(v.edited_at))} · {nameOf(v.edited_by)}
                    </summary>
                    <div className="mt-2 rounded-lg border border-line p-3">
                      <p className="mb-2 text-sm font-semibold">{v.title}</p>
                      <KbText body={v.body} className="space-y-2 text-xs leading-relaxed text-muted" />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
