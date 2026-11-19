import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import { SUPPORT_ROLES } from "@/lib/support/labels";
import { setSavedReplyActive } from "../actions";
import { SavedReplyForm } from "./saved-form";

export const metadata: Metadata = { title: "Saved replies" };

export default async function SavedRepliesPage() {
  await requireStaff(SUPPORT_ROLES);
  const supabase = await createClient();
  const { data: replies } = await supabase
    .from("support_saved_replies")
    .select("id, title, body, category, active")
    .order("active", { ascending: false })
    .order("title");

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/support" className="text-muted hover:text-accent">← Support</Link>
      </p>
      <PageHeader eyebrow="Support" title="Saved replies" />
      <p className="mb-6 max-w-2xl text-sm text-muted">
        Answers you send often. Pick one in a conversation and it drops into the reply box, where you can still change it.
        Write <code>{"{first_name}"}</code> where the customer&apos;s first name goes and <code>{"{my_name}"}</code> for yours.
      </p>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {replies?.length ? (
            replies.map((r) => (
              <Card key={r.id}>
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {r.title}
                      {r.category && <Pill>{r.category}</Pill>}
                      {!r.active && <Pill tone="warn">Off</Pill>}
                    </span>
                    <span className="text-xs text-muted">Open to edit</span>
                  </summary>
                  <div className="mt-4 space-y-3">
                    <SavedReplyForm reply={r} />
                    <form action={setSavedReplyActive.bind(null, r.id, !r.active)}>
                      <button className="text-sm text-muted underline-offset-2 hover:text-accent hover:underline">
                        {r.active ? "Switch off (hide it from the reply box)" : "Switch back on"}
                      </button>
                    </form>
                  </div>
                </details>
              </Card>
            ))
          ) : (
            <Card>
              <Empty>No saved replies yet. Add the first one on the right.</Empty>
            </Card>
          )}
        </div>
        <Card title="New saved reply">
          <SavedReplyForm />
        </Card>
      </div>
    </>
  );
}
