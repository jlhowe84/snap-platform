import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortalViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Pill, cx } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/dates";

type Step = { title: string; detail: string; state: "done" | "todo" | "later"; href?: string; cta?: string };

export default async function PortalJob({ params }: PageProps<"/portal/[jobId]">) {
  await requirePortalViewer();
  const { jobId } = await params;
  const supabase = await createClient();

  const { data: job } = await supabase.from("jobs").select("id, name, status").eq("id", jobId).maybeSingle();
  if (!job) notFound();

  const [{ data: days }, { data: holds }, { data: signatures }, { data: readiness }] = await Promise.all([
    supabase.from("photo_days").select("id, date, start_time, end_time, location_name, city, state").eq("job_id", jobId).order("date"),
    supabase.from("date_holds").select("photo_day_id, status, expires_on").eq("job_id", jobId),
    supabase.from("agreement_signatures").select("id, signer_name, signed_at").eq("job_id", jobId).order("signed_at", { ascending: false }).limit(1),
    supabase.from("photo_day_readiness").select("*").eq("job_id", jobId),
  ]);

  const signature = signatures?.[0];
  const released = job.status === "released" || job.status === "cancelled";
  const held = (holds ?? []).filter((h) => h.status === "held");
  const firstExpiry = held.map((h) => h.expires_on).sort()[0];
  const r = readiness?.[0];

  const steps: Step[] = [
    {
      title: "Confirm your date",
      detail: signature
        ? `Signed by ${signature.signer_name} on ${formatDate(signature.signed_at.slice(0, 10))}.`
        : firstExpiry
          ? `We are holding your date until ${formatDate(firstExpiry)}. Read and sign the agreement to confirm it.`
          : "Read and sign the photo day agreement.",
      state: signature ? "done" : "todo",
      href: `/portal/${jobId}/agreement`,
      cta: signature ? "View agreement" : "Read and sign",
    },
    {
      title: "Planning form",
      detail: r?.planning_form === "submitted" ? "Received. Thank you." : "Tell us about your teams, fields and picture day contact.",
      state: r?.planning_form === "submitted" ? "done" : signature ? "todo" : "later",
    },
    {
      title: "Rosters",
      detail: r && r.roster !== "not_received" ? "Received." : "Upload your rosters in any format: spreadsheet, PDF or a photo.",
      state: r && r.roster !== "not_received" ? "done" : signature ? "todo" : "later",
    },
    {
      title: "Picture day schedule",
      detail: r?.schedule === "submitted" || r?.schedule === "complete" ? "Submitted." : "Place each team in a time slot.",
      state: r?.schedule === "submitted" || r?.schedule === "complete" ? "done" : signature ? "todo" : "later",
    },
  ];

  return (
    <>
      <PageHeader eyebrow="Photo day" title={job.name} />

      {released && (
        <p className="mb-6 rounded-lg border border-risk/40 p-4 text-sm text-risk">
          This date is no longer held for you. Reply to our last email if you would still like a photo day.
        </p>
      )}

      <Card title="When and where" className="mb-6">
        <ul className="divide-y divide-line">
          {(days ?? []).map((d) => {
            const hold = holds?.find((h) => h.photo_day_id === d.id);
            return (
              <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <div>
                  <p className="font-medium">{formatDate(d.date, { weekday: true })}</p>
                  <p className="text-sm text-muted">
                    {[formatTime(d.start_time), formatTime(d.end_time)].filter(Boolean).join(" to ") || "Times to confirm"}
                    {" · "}
                    {[d.location_name, d.city, d.state].filter(Boolean).join(", ") || "Location to confirm"}
                  </p>
                </div>
                {hold?.status === "held" && <Pill tone="warn">Held until {formatDate(hold.expires_on)}</Pill>}
                {hold?.status === "confirmed" && <Pill tone="ok">Confirmed</Pill>}
              </li>
            );
          })}
        </ul>
      </Card>

      {!released && (
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li
              key={s.title}
              className={cx(
                "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4",
                s.state === "later" && "opacity-60",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cx(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    s.state === "done" ? "bg-ok text-bg" : "bg-surface-2 text-muted",
                  )}
                  aria-hidden
                >
                  {s.state === "done" ? "✓" : i + 1}
                </span>
                <div>
                  <p className="font-medium">{s.title}</p>
                  <p className="text-sm text-muted">{s.state === "later" ? "Opens once your date is confirmed." : s.detail}</p>
                </div>
              </div>
              {s.href && (
                <Link
                  href={s.href}
                  className={cx(
                    "rounded-lg px-4 py-2 text-sm font-semibold",
                    s.state === "done" ? "border border-line hover:bg-surface-2" : "bg-accent text-accent-ink hover:brightness-110",
                  )}
                >
                  {s.cta}
                </Link>
              )}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
