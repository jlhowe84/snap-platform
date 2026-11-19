import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill, cx } from "@/components/ui";
import { SUPPORT_ROLES, SUPPORT_STATUS_LABEL, SUPPORT_STATUS_TONE, SUPPORT_VIEWS, supportView } from "@/lib/support/labels";
import { CheckMail } from "./check-mail";

export const metadata: Metadata = { title: "Support" };
// Checking for mail reads the mailbox a day at a time.
export const maxDuration = 60;

export default async function SupportPage({ searchParams }: PageProps<"/support">) {
  const viewer = await requireStaff(SUPPORT_ROLES);
  const sp = await searchParams;
  const view = supportView(typeof sp.view === "string" ? sp.view : undefined);
  const supabase = await createClient();

  let q = supabase
    .from("support_conversations")
    .select("id, subject, customer_name, customer_email, status, category, assignee_id, last_message_at, last_inbound_at, organizations(name)")
    .in("status", [...view.statuses])
    .order("last_message_at", { ascending: view.key !== "closed", nullsFirst: false })
    .limit(100);
  if (view.key === "mine") q = q.eq("assignee_id", viewer.id);
  if (view.key === "unassigned") q = q.is("assignee_id", null);

  const [{ data: rows }, { data: people }, { count: needs }] = await Promise.all([
    q,
    supabase.from("profiles").select("id, full_name"),
    supabase.from("support_conversations").select("id", { count: "exact", head: true }).in("status", ["new", "open"]),
  ]);
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: viewer.timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });

  return (
    <>
      <PageHeader eyebrow="Support" title={needs ? `${needs} need a reply` : "All answered"}>
        <CheckMail />
      </PageHeader>

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Lists">
        {SUPPORT_VIEWS.map((v) => (
          <Link
            key={v.key}
            href={v.key === "needs" ? "/support" : `/support?view=${v.key}`}
            aria-current={v.key === view.key ? "page" : undefined}
            className={cx(
              "rounded-lg border px-3 py-1.5 text-sm font-medium",
              v.key === view.key ? "border-accent bg-accent text-accent-ink" : "border-line text-muted hover:border-accent hover:text-accent",
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
                    </div>
                    <div className="text-right text-xs text-muted">
                      <p>{c.last_message_at ? when.format(new Date(c.last_message_at)) : ""}</p>
                      <p>{c.assignee_id ? (nameOf.get(c.assignee_id) ?? "Assigned") : "Unassigned"}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>{view.key === "needs" ? "Nothing is waiting on a reply." : "Nothing in this list."}</Empty>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">
        Mail is read from the support mailbox. Replies still go out from Hiver until the reply box is built here.
      </p>
    </>
  );
}
