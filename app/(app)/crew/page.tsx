import type { Metadata } from "next";
import { requireStaff, OFFICE_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";

export const metadata: Metadata = { title: "Crew" };

export default async function CrewPage() {
  await requireStaff(OFFICE_ROLES);
  const supabase = await createClient();
  const { data: crew, error } = await supabase
    .from("crew_members")
    .select("id, full_name, email, phone, city, state, positions, level, active")
    .order("active", { ascending: false })
    .order("full_name");

  return (
    <>
      <PageHeader eyebrow="People" title="Crew" />
      <Card>
        {error ? (
          <Empty>Could not load crew: {error.message}</Empty>
        ) : !crew?.length ? (
          <Empty>No crew yet. They arrive with the Notion staff import.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {crew.map((c) => (
              <li key={c.id} className="grid gap-1 px-2 py-3 md:grid-cols-[1.5fr_2fr_1fr] md:items-center">
                <div>
                  <p className="font-medium">
                    {c.full_name} {!c.active && <Pill>Inactive</Pill>}
                  </p>
                  <p className="text-sm text-muted">{[c.city, c.state].filter(Boolean).join(", ")}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {c.positions.map((p) => (
                    <Pill key={p}>{p}</Pill>
                  ))}
                  {c.level != null && <Pill tone="accent">Level {c.level}</Pill>}
                </div>
                <p className="text-sm text-muted">{[c.email, c.phone].filter(Boolean).join(" · ")}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
