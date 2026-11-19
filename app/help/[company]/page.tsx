import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { KbText } from "@/components/kb-text";
import { PublicShell } from "@/components/public-shell";

const loadCompany = cache(async (slug: string) => {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_company", { p_company_slug: slug });
  return (data as { name: string; slug: string } | null) ?? null;
});

export async function generateMetadata({ params }: PageProps<"/help/[company]">): Promise<Metadata> {
  const company = await loadCompany((await params).company);
  return { title: company ? `${company.name} help center` : "Help center" };
}

export default async function HelpCenter({ params, searchParams }: PageProps<"/help/[company]">) {
  const company = await loadCompany((await params).company);
  if (!company) notFound();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 200) : "";
  const supabase = await createClient();
  const { data: articles } = await supabase.rpc("public_help_articles", { p_company_slug: company.slug, p_query: q || undefined });
  const list = articles ?? [];
  const sections = new Map<string, typeof list>();
  for (const a of list) {
    const key = q ? "Results" : (a.section ?? "More answers");
    sections.set(key, [...(sections.get(key) ?? []), a]);
  }

  return (
    <PublicShell companyName={company.name} companySlug={company.slug} kicker="Help center">
      <h1 className="font-display text-4xl font-semibold uppercase tracking-wide">How can we help?</h1>
      <form className="mt-4 flex gap-2" role="search">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search: order, gallery link, shipping…"
          aria-label="Search the help center"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        />
        <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110">Search</button>
      </form>
      {q && (
        <p className="mt-2 text-sm text-muted">
          {list.length ? `${list.length} answer${list.length === 1 ? "" : "s"} for “${q}”.` : `Nothing matched “${q}”. Try other words.`}{" "}
          <a href="?" className="text-accent hover:underline">Show all</a>
        </p>
      )}
      {!q && list.length === 0 && <p className="mt-6 text-sm text-muted">Answers are on their way. Reply to any email from us and a person will help.</p>}

      <div className="mt-8 space-y-8">
        {[...sections.entries()].map(([section, items]) => (
          <section key={section}>
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{section}</h2>
            <div className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface">
              {items.map((a) => (
                <details key={a.id} className="group px-5 py-3" open={!!q && items.length <= 3}>
                  <summary className="cursor-pointer list-none font-medium marker:hidden">
                    <span className="mr-2 inline-block text-accent transition-transform group-open:rotate-90">›</span>
                    {a.title}
                  </summary>
                  <KbText body={a.body} className="mt-3 space-y-3 text-sm leading-relaxed text-muted" />
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </PublicShell>
  );
}
