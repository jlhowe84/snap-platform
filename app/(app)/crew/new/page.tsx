import type { Metadata } from "next";
import Link from "next/link";
import { OFFICE_ROLES, requireStaff } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { DetailsForm } from "../[id]/profile-forms";

export const metadata: Metadata = { title: "Add crew member" };

export default async function NewCrewMemberPage() {
  await requireStaff(OFFICE_ROLES);
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/crew" className="text-muted hover:text-text">Crew</Link>
      </p>
      <PageHeader eyebrow="People" title="Add a crew member" />
      <Card>
        <DetailsForm crew={null} />
        <p className="mt-4 text-sm text-muted">After saving you can add their photo, home address, emergency contact and pay rates.</p>
      </Card>
    </>
  );
}
