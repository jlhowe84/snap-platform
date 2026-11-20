import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff, ADMIN_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { asSections, formatSections } from "@/lib/agreement/sections";
import { DraftEditor } from "./draft-editor";
import { activateDraft, newDraft } from "./actions";

export const metadata: Metadata = { title: "Agreement" };

export default async function AgreementSettings() {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();
  const { data: versions } = await supabase
    .from("agreement_versions")
    .select("id, version, title, sections, status, activated_at, created_at, agreement_signatures(count)")
    .order("version", { ascending: false });

  const draft = versions?.find((v) => v.status === "draft");
  const active = versions?.find((v) => v.status === "active");

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/settings" className="text-muted hover:text-text">
          ← Settings
        </Link>
      </p>
      <PageHeader eyebrow="Admin" title="Photo day agreement">
        {!draft && (
          <form action={newDraft}>
            <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110">
              {active ? "Start a new version" : "Write the agreement"}
            </button>
          </form>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {draft ? (
            <Card
              title={`Draft, version ${draft.version}`}
              action={
                <form action={activateDraft.bind(null, draft.id)}>
                  <button className="rounded-lg border border-accent/60 px-3 py-1.5 text-sm text-accent hover:bg-surface-2">
                    Make this the version leagues sign
                  </button>
                </form>
              }
            >
              <DraftEditor id={draft.id} title={draft.title} text={formatSections(asSections(draft.sections))} />
            </Card>
          ) : active ? (
            <Card title={`Version ${active.version} (leagues sign this one)`}>
              <div className="space-y-4">
                {asSections(active.sections).map((s) => (
                  <div key={s.key}>
                    <p className="font-medium">
                      {s.title} {s.initial && <Pill tone="accent">Initial</Pill>}
                    </p>
                    <p className="whitespace-pre-line text-sm text-muted">{s.body}</p>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Empty>No agreement yet. Write it here, then make it the version leagues sign.</Empty>
          )}
        </div>

        <Card title="Versions">
          {versions?.length ? (
            <ul className="divide-y divide-line text-sm">
              {versions.map((v) => {
                const signed = (v.agreement_signatures as unknown as { count: number }[])?.[0]?.count ?? 0;
                return (
                  <li key={v.id} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      Version {v.version}
                      <span className="text-muted"> · {formatDate((v.activated_at ?? v.created_at).slice(0, 10))}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {signed > 0 && <span className="text-xs text-muted">{signed} signed</span>}
                      <Pill tone={v.status === "active" ? "ok" : v.status === "draft" ? "warn" : "muted"}>{v.status}</Pill>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>None yet.</Empty>
          )}
          <p className="mt-4 text-xs text-muted">
            A version that has been signed can never change. Edits always become a new version, and each signature keeps
            the exact text it was signed under.
          </p>
        </Card>
      </div>
    </>
  );
}
