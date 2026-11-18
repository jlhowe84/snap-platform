import type { Metadata } from "next";
import Link from "next/link";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui";
import { NewJobForm } from "./form";

export const metadata: Metadata = { title: "New job" };

export default async function NewJobPage({ searchParams }: PageProps<"/jobs/new">) {
  await requireStaff(OFFICE_ROLES);
  const params = await searchParams;
  const supabase = await createClient();
  const { data: leagues } = await supabase.from("organizations").select("id, name").eq("active", true).order("name");
  const orgId = typeof params.org === "string" && leagues?.some((l) => l.id === params.org) ? params.org : null;

  return (
    <>
      <Link href="/jobs" className="text-sm text-muted underline-offset-2 hover:underline">Back to jobs</Link>
      <PageHeader eyebrow="Production" title="New job" />
      <Card className="max-w-3xl">
        <NewJobForm leagues={leagues ?? []} orgId={orgId} />
        <p className="mt-4 text-xs text-muted">
          League not in the list? <Link href="/leagues/new" className="text-accent hover:underline">Add the league first.</Link>
        </p>
      </Card>
    </>
  );
}
