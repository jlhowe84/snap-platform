"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isNoticeKind } from "@/lib/notices";

// A person marks their own notices read and chooses which kinds they get.
// RLS limits every write here to their own rows.

function refresh() {
  revalidatePath("/notices");
  revalidatePath("/", "layout");
}

export async function markRead(id: string) {
  await requireStaff();
  const noticeId = z.uuid().parse(id);
  const supabase = await createClient();
  await supabase.from("notices").update({ read_at: new Date().toISOString() }).eq("id", noticeId).is("read_at", null);
  refresh();
}

export async function markAllRead() {
  const viewer = await requireStaff();
  const supabase = await createClient();
  await supabase.from("notices").update({ read_at: new Date().toISOString() }).eq("profile_id", viewer.id).is("read_at", null);
  refresh();
}

export async function setNoticeKind(kind: string, on: boolean) {
  const viewer = await requireStaff();
  if (!isNoticeKind(kind) || !viewer.companyId) return;
  const supabase = await createClient();
  if (on) {
    await supabase.from("notice_mutes").delete().eq("profile_id", viewer.id).eq("kind", kind);
  } else {
    await supabase.from("notice_mutes").upsert({ profile_id: viewer.id, company_id: viewer.companyId, kind }, { onConflict: "profile_id,kind", ignoreDuplicates: true });
  }
  refresh();
}
