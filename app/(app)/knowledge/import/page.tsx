import type { Metadata } from "next";
import Link from "next/link";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { ImportForm } from "../forms";

export const metadata: Metadata = { title: "Import articles" };

export default async function ImportPage() {
  await requireStaff(OFFICE_ROLES);
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/knowledge" className="text-muted hover:text-accent">← Knowledge base</Link>
      </p>
      <PageHeader eyebrow="Knowledge" title="Import articles" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <ImportForm />
        </Card>
        <Card title="How it reads the document">
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
            <li>Each line starting with <code>##</code> starts a section.</li>
            <li>Each <code>###</code> question becomes an article on the Answers for parents shelf.</li>
            <li>In a section with no questions, a line that is only bold text (like a template name) starts an article.</li>
            <li>Anything else becomes one article per section on the Support desk shelf.</li>
            <li>Text before the first section is left out. An article already here with the same shelf, section and title is skipped.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
