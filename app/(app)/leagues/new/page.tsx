import type { Metadata } from "next";
import Link from "next/link";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { NewLeagueForm } from "./form";

export const metadata: Metadata = { title: "New league" };

export default async function NewLeaguePage() {
  await requireStaff(OFFICE_ROLES);
  return (
    <>
      <Link href="/leagues" className="text-sm text-muted underline-offset-2 hover:underline">Back to leagues</Link>
      <PageHeader eyebrow="Customers" title="New league" />
      <Card className="max-w-3xl">
        <NewLeagueForm />
      </Card>
    </>
  );
}
