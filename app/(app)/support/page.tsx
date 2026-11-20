import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill, cx } from "@/components/ui";
import { SUPPORT_ROLES, SUPPORT_STATUS_LABEL, SUPPORT_STATUS_TONE, SUPPORT_VIEWS, supportView } from "@/lib/support/labels";
import { messagePreview, searchTerm, waitingSince } from "@/lib/support/preview";
import { CheckMail } from "./check-mail";

export const metadata: Metadata = { title: "Support" };
// Checking for mail reads the mailbox a day at a time.
export const maxDuration = 60;

export default async function SupportPage({ searchParams }: PageProps<"/support">) {
  const viewer = await requireStaff(SUPPORT_ROLES);
  const sp = await searchParams;
  const view = supportView(typeof sp.view === "string" ? sp.view : undefined);
  const term = searchTerm(typeof sp.q === "string" ? sp.q : undefined);
  const supabase = await createClient();

  let q = supabase
    .from("support_conversations")
    .select("id, subject, customer_name, customer_email, status, category, assignee_id, last_message_at, last_inbound_at, organizations(name)")
    .order("last_message_at", { ascending: !term && view.key !== "closed", nullsFirst: false })
    .limit(100);
  if (term) {
    // A search looks through every list, closed ones included.
    q = q.or(`subject.ilike.%${term}%,customer_name.ilike.%${term}%,customer_email.ilike.%${term}%`);
  } else {
    q = q.in("status", [...view.statuses]);
    if (view.key === "mine") q = q.eq("assignee_id", viewer.id);
    if (view.key === "unassigned") q = q.is("assignee_id", null);
  }

  const [{ data: rows }, { data: people }, { count: needs }] = await Promise.all([
    q,
    supabase.from("profiles").select("id, full_name"),
    supabase.from("support_conversations").select("id", { count: "exact", head: true }).in("status", ["new", "open"]),
  ]);
  // The opening of each customer's latest message, so rows with the same
  // subject can be told apart without opening them.
  const lastIn = [...new Set((rows ?? []).map((r) => r.last_inbound_at).filter((x): x is string => !!x))];
  const { data: latest } = lastIn.length
    ? await supabase
        .from("support_messages")
        .select("conversation_id, body_text")
        .eq("direction", "in")
        .in("conversation_id", (rows ?? []).map((r) => r.id))
        .in("sent_at", lastIn)
    : { data: [] as { conversation_id: string; body_text: string }[] };
  const preview = new Map((latest ?? []).map((m) => [m.conversation_id, messagePreview(m.body_text)]));
  const now = new Date();
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: viewer.timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });

  return (
    <>
      <PageHeader eyebrow="Customers · Support" title={needs ? `${needs} need a reply` : "All answered"}>
        <Link href="/support/replies" className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:border-accent hover:text-accent">
          Saved replies
        </Link>
        <CheckMail />
      </PageHeader>

      <form action="/support" className="mb-4 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={term}
          placeholder="Search by name, email or subject"
          aria-label="Search support conversations"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2.5 text-base focus:border-accent focus:outline-none"
        />
        <button className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:border-accent hover:text-accent">Search</button>
      </form>
      {term && (
        <p className="mb-4 text-sm text-muted">
          {rows?.length ?? 0} found for &ldquo;{term}&rdquo; across every list.{" "}
          <Link href="/support" className="text-accent hover:underline">Clear search</Link>
        </p>
      )}

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Lists">
        {SUPPORT_VIEWS.map((v) => (
          <Link
            key={v.key}
            href={v.key === "needs" ? "/support" : `/support?view=${v.key}`}
            aria-current={!term && v.key === view.key ? "page" : undefined}
            className={cx(
              "rounded-lg border px-3 py-1.5 text-sm font-medium",
              !term && v.key === view.key ? "border-accent bg-accent text-accent-ink" : "border-line text-muted hover:border-accent hover:text-accent",
            )}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      <Card>
        {rows?.length ? (
          <ul className="divide-y divide-line">
            {rows.map((c) => {
              const league = (c.organizations as { name: string } | null)?.name;
              const waits = c.status === "new" || c.status === "open" ? waitingSince(c.last_inbound_at, now) : null;
              const first = preview.get(c.id);
              return (
                <li key={c.id}>
                  <Link href={`/support/${c.id}`} className="flex flex-wrap items-start justify-between gap-3 py-3 hover:text-accent">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm">
                        <Pill tone={SUPPORT_STATUS_TONE[c.status]}>{SUPPORT_STATUS_LABEL[c.status]}</Pill>
                        <span className="truncate font-medium">{c.subject}</span>
                      </p>
                      <p className="mt-0.5 text-sm text-muted">
                        {c.customer_name ?? c.customer_email ?? "Unknown sender"}
                        {league ? ` · ${league}` : ""}
                        {c.category ? ` · ${c.category}` : ""}
                      </p>
                      {first && <p className="mt-0.5 line-clamp-2 text-sm text-muted/80">{first}</p>}
                    </div>
                    <div className="text-right text-xs text-muted">
                      {waits && (
                        <p className={cx("font-semibold", waits.tone === "risk" ? "text-risk" : waits.tone === "warn" ? "text-warn" : "")}>{waits.label}</p>
                      )}
                      <p>{c.last_message_at ? when.format(new Date(c.last_message_at)) : ""}</p>
                      <p>{c.assignee_id ? (nameOf.get(c.assignee_id) ?? "Assigned") : "Unassigned"}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>{term ? "No conversation matches that search." : view.key === "needs" ? "Nothing is waiting on a reply." : "Nothing in this list."}</Empty>
        )}
      </Card>
    </>
  );
}
