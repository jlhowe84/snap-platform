import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader } from "@/components/ui";
import { DetailsForm } from "./details-form";

export const metadata: Metadata = { title: "My details" };

const text = z.string().nullable().catch(null);
const Details = z.object({
  full_name: text, email: text, phone: text, city: text, state: text, address: text, emergency_name: text, emergency_phone: text,
});

// A crew member's own details. They change their phone, town, home address
// and emergency contact here; their name, email, positions and pay stay with
// the office.
export default async function MyDetailsPage() {
  await requireStaff(["crew"]);
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_crew_details");
  const mine = Details.safeParse(data);

  return (
    <div className="mx-auto max-w-xl">
      <p className="mb-2 text-sm">
        <Link href="/shifts" className="text-muted hover:text-text">My shifts</Link>
      </p>
      <PageHeader eyebrow="Crew" title="My details" />
      {!mine.success ? (
        <Empty>Your sign-in is not linked to a crew record yet. Ask the office to check your email address on your crew page.</Empty>
      ) : (
        <Card title={mine.data.full_name ?? "Your details"}>
          <p className="mb-4 text-sm text-muted">
            {mine.data.email ? `You sign in as ${mine.data.email}. ` : ""}To change your name or email, ask the office.
          </p>
          <DetailsForm current={mine.data} />
        </Card>
      )}
    </div>
  );
}
