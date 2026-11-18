import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePortalViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/dates";

export default async function PortalHome() {
  const viewer = await requirePortalViewer();
  if (viewer.staff) redirect("/jobs");
  const supabase = await createClient();
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, name, status, photo_days(date)")
    .not("status", "in", "(released,cancelled)")
    .order("created_at", { ascending: false });

  if (jobs?.length === 1) redirect(`/portal/${jobs[0].id}`);

  return (
    <>
      <PageHeader eyebrow="Welcome" title="Your photo days" />
      <Card>
        {jobs?.length ? (
          <ul className="divide-y divide-line">
            {jobs.map((j) => {
              const first = [...(j.photo_days ?? [])].map((d) => d.date).sort()[0];
              return (
                <li key={j.id} className="py-3">
                  <Link href={`/portal/${j.id}`} className="flex justify-between gap-3 hover:text-accent">
                    <span className="font-medium">{j.name}</span>
                    <span className="text-sm text-muted">{first ? formatDate(first) : "Date to confirm"}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>There is nothing open for you right now.</Empty>
        )}
      </Card>
    </>
  );
}
