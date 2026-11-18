import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortalViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { asSections } from "@/lib/agreement/sections";
import { SignForm } from "./sign-form";

export default async function AgreementPage({ params }: PageProps<"/portal/[jobId]/agreement">) {
  const viewer = await requirePortalViewer();
  const { jobId } = await params;
  const supabase = await createClient();

  const { data: job } = await supabase.from("jobs").select("id, name, status").eq("id", jobId).maybeSingle();
  if (!job) notFound();

  const { data: signatures } = await supabase
    .from("agreement_signatures")
    .select("id, signer_name, signer_email, signed_at, initials, version_id")
    .eq("job_id", jobId)
    .order("signed_at", { ascending: false })
    .limit(1);
  const signature = signatures?.[0];

  // A signed job shows the version that was signed; otherwise the current one.
  const versionQuery = supabase.from("agreement_versions").select("id, version, title, sections");
  const { data: version } = signature
    ? await versionQuery.eq("id", signature.version_id).maybeSingle()
    : await versionQuery.eq("status", "active").maybeSingle();

  const sections = asSections(version?.sections);
  const initials = (signature?.initials ?? {}) as Record<string, string>;
  const closed = job.status === "released" || job.status === "cancelled";

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/portal/${jobId}`} className="text-muted hover:text-text">
          ← {job.name}
        </Link>
      </p>
      <PageHeader eyebrow={version ? `Version ${version.version}` : "Agreement"} title={version?.title ?? "Photo day agreement"}>
        {signature && <Pill tone="ok">Signed</Pill>}
      </PageHeader>

      {!version ? (
        <Empty>The agreement is not ready yet. We will email you when it is.</Empty>
      ) : signature ? (
        <>
          <Card className="mb-6">
            <p>
              Signed by <strong>{signature.signer_name}</strong> ({signature.signer_email}) on{" "}
              {formatDate(signature.signed_at.slice(0, 10))}.
            </p>
            <a
              href={`/portal/${jobId}/agreement/pdf`}
              className="mt-3 inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110"
            >
              Download the signed PDF
            </a>
          </Card>
          <div className="space-y-4">
            {sections.map((s) => (
              <Card key={s.key} title={s.title}>
                <p className="whitespace-pre-line text-sm">{s.body}</p>
                {s.initial && <p className="mt-3 text-sm text-muted">Initialed: {initials[s.key] ?? "None"}</p>}
              </Card>
            ))}
          </div>
        </>
      ) : closed ? (
        <Empty>This date is no longer held, so the agreement cannot be signed. Reply to our last email to talk it over.</Empty>
      ) : (
        <SignForm jobId={jobId} versionId={version.id} sections={sections} canSign={!viewer.staff} />
      )}
    </>
  );
}
