import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "My pay" };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// A crew member's own pay: what is coming and what has been paid.
export default async function MyPayPage() {
  const viewer = await requireStaff(["crew"]);
  const supabase = await createClient();
  // Only this person's lines, even for someone who is also office and may read everyone's.
  const { data: me } = await supabase.from("crew_members").select("id").eq("profile_id", viewer.id).maybeSingle();
  const { data: pay, error } = me
    ? await supabase
        .from("pay_lines")
        .select("id, work_date, description, total, status")
        .eq("crew_member_id", me.id)
        .order("work_date", { ascending: false })
        .limit(100)
    : { data: [], error: null };

  const sum = (paid: boolean) =>
    (pay ?? []).filter((p) => (p.status === "paid") === paid).reduce((t, p) => t + Number(p.total ?? 0), 0);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader eyebrow="Crew" title="My pay" />
      {error ? (
        <Empty>Could not load your pay. Try again in a minute.</Empty>
      ) : !pay?.length ? (
        <Empty>No pay recorded yet. It shows up here after a shift you worked is entered by the office.</Empty>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3">
            {([["Coming", sum(false)], ["Paid", sum(true)]] as const).map(([label, total]) => (
              <div key={label} className="min-w-0 rounded-xl border border-line bg-surface p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
                <p className="mt-1 truncate font-display text-2xl font-semibold">{money.format(total)}</p>
              </div>
            ))}
          </div>
          <Card>
            <ul className="divide-y divide-line">
              {pay.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="block font-medium">{formatDate(p.work_date)}</span>
                    <span className="block text-sm text-muted">{p.description}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {money.format(Number(p.total ?? 0))}
                    <Pill tone={p.status === "paid" ? "ok" : "muted"}>{p.status === "paid" ? "Paid" : "Coming"}</Pill>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <p className="mt-3 text-xs text-muted">Something look wrong? Call or text the office.</p>
        </>
      )}
    </div>
  );
}
