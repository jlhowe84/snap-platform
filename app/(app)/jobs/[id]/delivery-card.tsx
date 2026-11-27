import Link from "next/link";
import { Card, Pill } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayIn } from "@/lib/dates";
import { CLOSEOUT_DAYS_SETTING, CLOSEOUT_KEY, closeoutDueOn, GALLERY_LIVE_KEY, readCloseoutDays } from "@/lib/delivery/drafts";
import { explainAmount, OBLIGATION_KIND_LABEL, type ObligationKind } from "@/lib/delivery/terms";
import { AddObligationForm, CloseoutButtons, GalleryLiveForm, LessonForm, ObligationRow, type ObligationView } from "./delivery";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * Delivery and close-out on the job page (office roles only): the gallery-live
 * tick, the close-out date and email, what the league is owed, and lessons for
 * next season.
 */
export async function DeliveryCard({
  job,
  timeZone,
}: {
  job: { id: string; status: string; gallery_live_at: string | null; order_deadline: string | null; delivered_at: string | null; closed_out_at: string | null };
  timeZone: string;
}) {
  const supabase = await createClient();
  const [{ data: rows }, { data: drafts }, { data: daysSetting }, { data: staff }] = await Promise.all([
    supabase
      .from("job_obligations")
      .select("id, kind, direction, title, basis, amount, computed, due_on, owner_id, status, closed_note, quickbooks_ref, closed_at, closed_by")
      .eq("job_id", job.id)
      .order("status")
      .order("created_at"),
    supabase
      .from("agent_actions")
      .select("id, action_type_key, status, created_at")
      .in("action_type_key", [GALLERY_LIVE_KEY, CLOSEOUT_KEY])
      .contains("record_refs", { job_id: job.id })
      .order("created_at", { ascending: false }),
    supabase.from("settings").select("value").eq("key", CLOSEOUT_DAYS_SETTING).maybeSingle(),
    supabase.from("profiles").select("id, full_name").eq("active", true).order("full_name"),
  ]);
  const stamp = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" });
  const days = readCloseoutDays(daysSetting?.value);
  const deliveredDay = job.delivered_at ? todayIn(timeZone, new Date(job.delivered_at)) : null;
  const closeoutOn = deliveredDay ? closeoutDueOn(deliveredDay, days) : null;
  const latest = (key: string) => (drafts ?? []).find((d) => d.action_type_key === key);
  const liveDraft = latest(GALLERY_LIVE_KEY);
  const closeDraft = latest(CLOSEOUT_KEY);
  const draftWord = (s?: string) => (s === "sent" ? "sent" : s === "rejected" ? "rejected" : s === "failed" ? "failed to send" : "waiting in the queue");

  const people = (staff ?? []).map((p) => ({ id: p.id, name: p.full_name ?? "Someone" }));
  const list: ObligationView[] = (rows ?? []).map((r) => {
    const closer = (staff ?? []).find((p) => p.id === r.closed_by)?.full_name;
    return {
      id: r.id,
      kindLabel: OBLIGATION_KIND_LABEL[r.kind as ObligationKind] ?? r.kind,
      title: r.title,
      owedIn: r.direction === "owed_in",
      amount: r.amount === null ? null : Number(r.amount),
      dueOn: r.due_on,
      dueLabel: r.due_on ? formatDate(r.due_on) : null,
      ownerId: r.owner_id,
      status: r.status,
      explain: explainAmount(r.computed as Parameters<typeof explainAmount>[0]),
      basis: r.basis,
      closedNote: r.closed_note,
      quickbooksRef: r.quickbooks_ref,
      closedLine: r.closed_at
        ? `${r.status === "void" ? "Not owed" : "Closed"} ${stamp.format(new Date(r.closed_at))}${closer ? ` by ${closer}` : ""}${r.closed_note ? `: ${r.closed_note}` : ""}${r.quickbooks_ref ? ` (QuickBooks ${r.quickbooks_ref})` : ""}`
        : null,
    };
  });
  const openOut = list.filter((o) => o.status === "open" && !o.owedIn);
  const owedTotal = openOut.reduce((t, o) => t + (o.amount ?? 0), 0);
  const unknown = openOut.filter((o) => o.amount === null && o.kindLabel !== OBLIGATION_KIND_LABEL.delivery_box).length;

  return (
    <Card id="delivery" title="Delivery and close-out">
      <div className="space-y-5 text-sm">
        <section>
          <h3 className="mb-2 font-semibold">Galleries</h3>
          {job.gallery_live_at ? (
            <p>
              <Pill tone="ok">Live</Pill> <span className="text-muted">since {stamp.format(new Date(job.gallery_live_at))}</span>
              {job.order_deadline && <span className="text-muted"> · order by {formatDate(job.order_deadline)}</span>}
              {liveDraft && <span className="text-muted"> · notice {draftWord(liveDraft.status)}</span>}
            </p>
          ) : (
            <>
              <p className="mb-2 text-muted">
                Tick this when the league should be told. Images can be in the galleries before then. It drafts the notice to the coordinator with the gallery link,
                the coupon and the deadline, for you to approve in the <Link href="/queue" className="underline hover:text-accent">queue</Link>.
              </p>
              <GalleryLiveForm jobId={job.id} defaultDeadline={job.order_deadline} />
            </>
          )}
        </section>

        <section>
          <h3 className="mb-2 font-semibold">Close-out</h3>
          <p className="mb-2 text-muted">
            {job.closed_out_at
              ? `Close-out email drafted ${stamp.format(new Date(job.closed_out_at))}${closeDraft ? `, ${draftWord(closeDraft.status)}` : ""}.`
              : closeoutOn
                ? `Delivered ${formatDate(deliveredDay)}. The close-out email (thank-you, feedback, next season's date) is drafted on ${formatDate(closeoutOn)}, ${days} days after delivery.`
                : "The close-out email is drafted a set number of days after the job is marked delivered."}
          </p>
          <CloseoutButtons jobId={job.id} closedOut={!!job.closed_out_at} />
        </section>

        <section>
          <h3 className="mb-1 font-semibold">Owed</h3>
          {list.length ? (
            <>
              <p className="text-muted">
                {openOut.length ? `${usd(owedTotal)} open` : "Nothing open"}
                {unknown ? ` · ${unknown} without an amount yet` : ""}. Amounts come from the league&apos;s terms and the order ledger; rebates count prepay sales before
                tax.
              </p>
              <ul className="divide-y divide-line">
                {list.map((o) => (
                  <ObligationRow key={o.id} o={o} staff={people} />
                ))}
              </ul>
            </>
          ) : (
            <p className="text-muted">Nothing listed yet. Work out the amounts, or they are listed at close-out.</p>
          )}
          <AddObligationForm jobId={job.id} kinds={Object.entries(OBLIGATION_KIND_LABEL) as [string, string][]} />
        </section>

        <section>
          <h3 className="mb-2 font-semibold">Lessons</h3>
          <LessonForm jobId={job.id} />
        </section>
      </div>
    </Card>
  );
}
