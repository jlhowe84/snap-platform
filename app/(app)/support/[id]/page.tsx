import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Pill, cx } from "@/components/ui";
import { SUPPORT_ROLES, SUPPORT_STATUS_LABEL, SUPPORT_STATUS_TONE } from "@/lib/support/labels";
import { takeConversation } from "../actions";
import { NoteForm, ReplyForm, WorkForm } from "./work";

export const metadata: Metadata = { title: "Support conversation" };

// Drafting a reply waits on the model; give the server action room to finish.
export const maxDuration = 60;

export default async function ConversationPage({ params }: PageProps<"/support/[id]">) {
  const viewer = await requireStaff(SUPPORT_ROLES);
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createClient();

  const [{ data: c }, { data: messages }, { data: people }, { data: settings }, { data: saved }] = await Promise.all([
    supabase
      .from("support_conversations")
      .select("id, subject, customer_name, customer_email, status, category, assignee_id, mailbox, organization_id, first_response_at, organizations(name)")
      .eq("id", id.data)
      .maybeSingle(),
    supabase
      .from("support_messages")
      .select("id, direction, from_name, from_address, to_addresses, body_text, author_id, sent_at")
      .eq("conversation_id", id.data)
      .order("sent_at"),
    supabase.from("profiles").select("id, full_name, active, profile_roles(role)").order("full_name"),
    supabase.from("settings").select("key, value").in("key", ["support.categories", "mail.test_mode"]),
    supabase.from("support_saved_replies").select("id, title, body").eq("active", true).order("title"),
  ]);
  if (!c) notFound();

  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const desk = (people ?? [])
    .filter((p) => p.active && (p.profile_roles as { role: string }[]).some((r) => (SUPPORT_ROLES as readonly string[]).includes(r.role)))
    .map((p) => ({ id: p.id, name: p.full_name ?? "Unnamed" }));
  const listed = settings?.find((r) => r.key === "support.categories")?.value;
  // Missing means on, the same rule the mail guard uses.
  const testMode = settings?.find((r) => r.key === "mail.test_mode")?.value !== false;
  const categories = Array.isArray(listed) ? listed.filter((x): x is string => typeof x === "string") : [];
  const league = (c.organizations as { name: string } | null)?.name;
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: viewer.timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/support" className="text-muted hover:text-accent">← Support</Link>
      </p>
      <PageHeader eyebrow={c.customer_name ?? c.customer_email ?? "Unknown sender"} title={c.subject}>
        <Pill tone={SUPPORT_STATUS_TONE[c.status]}>{SUPPORT_STATUS_LABEL[c.status]}</Pill>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {(messages ?? []).map((m) => {
            const note = m.direction === "note";
            const ours = m.direction === "out";
            const who = note
              ? `${(m.author_id && nameOf.get(m.author_id)) ?? "Staff"} · note`
              : (m.from_name ?? m.from_address ?? (ours ? "SNAP" : "Customer"));
            return (
              <article
                key={m.id}
                className={cx(
                  "rounded-xl border p-4",
                  note ? "border-warn/40 bg-warn/5" : ours ? "border-accent/40 bg-surface" : "border-line bg-surface",
                )}
              >
                <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted">
                  <span className="text-sm font-medium text-text">
                    {who}
                    {!note && m.from_name && m.from_address ? <span className="font-normal text-muted"> · {m.from_address}</span> : null}
                  </span>
                  <span>
                    {note ? "Staff only" : ours ? "Sent" : "Received"} · {when.format(new Date(m.sent_at))}
                  </span>
                </header>
                <p className="whitespace-pre-wrap break-words text-sm">{m.body_text || "(no text)"}</p>
              </article>
            );
          })}
          <Card title="Reply" action={<Link href="/support/replies" className="text-sm text-muted hover:text-accent">Saved replies</Link>}>
            <ReplyForm id={c.id} to={c.customer_email} testMode={testMode} saved={saved ?? []} customerName={c.customer_name} myName={viewer.name} canDraft={(messages ?? []).some((m) => m.direction === "in")} />
          </Card>
          <Card>
            <NoteForm id={c.id} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card
            title="Working it"
            action={
              c.assignee_id !== viewer.id ? (
                <form action={takeConversation.bind(null, c.id)}>
                  <button className="rounded-lg border border-line px-2.5 py-1 text-sm hover:border-accent hover:text-accent">Take it</button>
                </form>
              ) : undefined
            }
          >
            <WorkForm id={c.id} status={c.status} assigneeId={c.assignee_id} category={c.category} people={desk} categories={categories} />
          </Card>
          <Card title="Who wrote">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted">From</dt>
                <dd>{c.customer_name ?? "Unknown"}</dd>
                {c.customer_email && <dd className="break-all text-muted">{c.customer_email}</dd>}
              </div>
              <div>
                <dt className="text-xs text-muted">League</dt>
                <dd>
                  {c.organization_id && league ? (
                    <Link href={`/leagues/${c.organization_id}`} className="hover:text-accent">{league}</Link>
                  ) : (
                    <span className="text-muted">Not matched to a league contact</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">First reply</dt>
                <dd>{c.first_response_at ? when.format(new Date(c.first_response_at)) : <span className="text-muted">None yet</span>}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Mailbox</dt>
                <dd className="break-all text-muted">{c.mailbox}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
