import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill, cx } from "@/components/ui";
import { NOTICE_KINDS, NOTICE_LABEL, isNoticeKind } from "@/lib/notices";
import { markAllRead, markRead, setNoticeKind } from "./actions";
import { SubmitButton } from "@/components/submit-button";

export const metadata: Metadata = { title: "Notices" };

const quiet = "rounded-lg border border-line px-2.5 py-1 text-sm hover:border-accent hover:text-accent";

export default async function NoticesPage() {
  const viewer = await requireStaff();
  const supabase = await createClient();
  const [{ data: notices }, { data: mutes }] = await Promise.all([
    supabase.from("notices").select("id, kind, title, detail, href, read_at, created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("notice_mutes").select("kind"),
  ]);
  const off = new Set((mutes ?? []).map((m) => m.kind));
  const unread = (notices ?? []).filter((n) => !n.read_at).length;
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: viewer.timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });

  return (
    <>
      <PageHeader eyebrow="Today · Notices" title={unread ? `${unread} new` : "All caught up"}>
        {unread > 0 && (
          <form action={markAllRead}>
            <SubmitButton className={quiet}>Mark all read</SubmitButton>
          </form>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          {notices?.length ? (
            <ul className="divide-y divide-line">
              {notices.map((n) => (
                <li key={n.id} className={cx("flex flex-wrap items-start justify-between gap-3 py-3", n.read_at && "opacity-60")}>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      {!n.read_at && <Pill tone="accent">New</Pill>}
                      {n.href ? (
                        <Link href={n.href} className="font-medium hover:text-accent">{n.title}</Link>
                      ) : (
                        <span className="font-medium">{n.title}</span>
                      )}
                    </p>
                    {n.detail && <p className="text-sm text-muted">{n.detail}</p>}
                    <p className="text-xs text-muted">
                      {isNoticeKind(n.kind) ? NOTICE_LABEL[n.kind].name : n.kind} · {when.format(new Date(n.created_at))}
                    </p>
                  </div>
                  {!n.read_at && (
                    <form action={markRead.bind(null, n.id)}>
                      <SubmitButton className={quiet}>Mark read</SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No notices. You only get one when something needs you.</Empty>
          )}
        </Card>

        <Card title="What I get">
          <p className="mb-3 text-xs text-muted">Notices show here in the app. Email, Google Chat and text come later.</p>
          <ul className="space-y-3">
            {NOTICE_KINDS.map((k) => {
              const on = !off.has(k);
              return (
                <li key={k} className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{NOTICE_LABEL[k].name}</p>
                    <p className="text-xs text-muted">{NOTICE_LABEL[k].hint}</p>
                  </div>
                  <form action={setNoticeKind.bind(null, k, !on)}>
                    <SubmitButton className={cx(quiet, on && "border-accent text-accent")} aria-pressed={on}>
                      {on ? "On" : "Off"}
                    </SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
