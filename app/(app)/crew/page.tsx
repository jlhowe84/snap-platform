import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff, hasAnyRole, ADMIN_ROLES, OFFICE_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ButtonLink, Card, Empty, PageHeader, Pill } from "@/components/ui";
import { POSITION_LABEL } from "@/lib/staffing/plan";
import { crewPhotoUrls } from "@/lib/staffing/photos";

export const metadata: Metadata = { title: "Crew" };

export default async function CrewPage() {
  const viewer = await requireStaff(OFFICE_ROLES);
  const supabase = await createClient();
  const { data: crew, error } = await supabase
    .from("crew_members")
    .select("id, full_name, email, phone, city, state, positions, level, active, photo_path")
    .order("active", { ascending: false })
    .order("full_name");
  const photos = await crewPhotoUrls((crew ?? []).map((c) => c.photo_path));

  return (
    <>
      <PageHeader eyebrow="People" title="Crew">
        {hasAnyRole(viewer, ADMIN_ROLES) && <ButtonLink href="/crew/pay" variant="ghost">Crew pay</ButtonLink>}
        <ButtonLink href="/crew/new">Add crew member</ButtonLink>
      </PageHeader>
      <Card>
        {error ? (
          <Empty>Could not load crew: {error.message}</Empty>
        ) : !crew?.length ? (
          <Empty>No crew yet. They arrive with the Notion staff import.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {crew.map((c) => (
              <li key={c.id} className="grid gap-1 px-2 py-3 md:grid-cols-[1.5fr_2fr_1fr] md:items-center">
                <div className="flex items-center gap-3">
                  {c.photo_path && photos.get(c.photo_path) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photos.get(c.photo_path)} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-muted">
                      {c.full_name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div>
                  <p className="font-medium">
                    <Link href={`/crew/${c.id}`} className="hover:text-accent">{c.full_name}</Link> {!c.active && <Pill>Inactive</Pill>}
                  </p>
                  <p className="text-sm text-muted">{[c.city, c.state].filter(Boolean).join(", ")}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {c.positions.map((p) => (
                    <Pill key={p}>{POSITION_LABEL[p] ?? p}</Pill>
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
