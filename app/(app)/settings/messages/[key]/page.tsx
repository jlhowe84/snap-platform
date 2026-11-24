import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Pill } from "@/components/ui";
import { GROUP_LABEL, messageDef, readTemplate, settingKeyOf } from "@/lib/messages/catalog";
import { savedMessages } from "@/lib/messages/server";
import { MessageForm } from "../form";

export const metadata: Metadata = { title: "Edit message" };

export default async function MessagePage({ params }: PageProps<"/settings/messages/[key]">) {
  await requireStaff(ADMIN_ROLES);
  const { key } = await params;
  const def = messageDef(decodeURIComponent(key));
  if (!def) notFound();
  const saved = await savedMessages(await createClient());
  const template = readTemplate(def, saved[settingKeyOf(def)]);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/settings/messages" className="text-muted hover:text-text">
          ← Messages
        </Link>
      </p>
      <PageHeader eyebrow={`Messages · ${GROUP_LABEL[def.group]}`} title={def.label}>
        {template.edited && <Pill tone="accent">Your wording</Pill>}
        <Pill tone={def.sends === "auto" ? "info" : "muted"}>{def.sends === "auto" ? "Sends on its own" : "Approval queue"}</Pill>
      </PageHeader>
      <p className="mb-6 max-w-3xl text-sm text-muted">
        {def.when}{" "}
        {def.sends === "queue" ? "It waits in the approval queue, where a person can still reword that one copy before it goes." : "It goes out without waiting for approval."}
      </p>
      <MessageForm
        key={template.subject + "\n" + template.body}
        messageKey={def.key}
        subject={template.subject}
        body={template.body}
        edited={template.edited}
      />
    </>
  );
}
