import type { Metadata } from "next";
import Link from "next/link";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Pill } from "@/components/ui";
import { GROUP_LABEL, MESSAGES, readTemplate, settingKeyOf, type MessageGroup } from "@/lib/messages/catalog";
import { savedMessages } from "@/lib/messages/server";

export const metadata: Metadata = { title: "Messages" };

/** Every email the platform writes, by who it goes to. Owner and admin edit the wording. */
export default async function MessagesSettings() {
  await requireStaff(ADMIN_ROLES);
  const saved = await savedMessages(await createClient());
  const groups = Object.keys(GROUP_LABEL) as MessageGroup[];

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/settings" className="text-muted hover:text-text">
          ← Settings
        </Link>
      </p>
      <PageHeader eyebrow="Admin" title="Messages" />
      <p className="mb-6 max-w-3xl text-sm text-muted">
        The wording of every email the platform writes. Open one to change its subject and message, see it filled in with example details, or go back to
        the original. Some go out on their own; others wait in the approval queue, where a person can still reword that one copy.
      </p>

      <div className="space-y-6">
        {groups.map((group) => (
          <Card key={group} title={GROUP_LABEL[group]}>
            <ul className="divide-y divide-line">
              {MESSAGES.filter((m) => m.group === group).map((m) => {
                const t = readTemplate(m, saved[settingKeyOf(m)]);
                return (
                  <li key={m.key}>
                    <Link href={`/settings/messages/${m.key}`} className="group flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-sm">
                      <span className="min-w-0">
                        <span className="font-semibold group-hover:text-accent">{m.label}</span>
                        <span className="block text-muted">{m.when}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        {t.edited && <Pill tone="accent">Your wording</Pill>}
                        <Pill tone={m.sends === "auto" ? "info" : "muted"}>{m.sends === "auto" ? "Sends on its own" : "Approval queue"}</Pill>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
