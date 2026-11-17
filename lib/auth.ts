import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export const STAFF_ROLES: readonly AppRole[] = ["owner", "admin", "office", "support", "crew"];
export const OFFICE_ROLES: readonly AppRole[] = ["owner", "admin", "office"];
export const ADMIN_ROLES: readonly AppRole[] = ["owner", "admin"];

export type Viewer = {
  id: string;
  email: string;
  name: string;
  companyId: string | null;
  companyName: string | null;
  timeZone: string;
  roles: AppRole[];
};

export function hasAnyRole(viewer: Pick<Viewer, "roles">, allowed: readonly AppRole[]) {
  return viewer.roles.some((r) => allowed.includes(r));
}

/** The signed-in person, or null. Cached for one request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, company_id")
    .eq("id", user.id)
    .maybeSingle();

  const { data: roleRows } = await supabase
    .from("profile_roles")
    .select("role")
    .eq("profile_id", user.id);

  let companyName: string | null = null;
  let timeZone = "America/New_York";
  if (profile?.company_id) {
    const { data: company } = await supabase
      .from("companies")
      .select("name, time_zone")
      .eq("id", profile.company_id)
      .maybeSingle();
    companyName = company?.name ?? null;
    timeZone = company?.time_zone ?? timeZone;
  }

  return {
    id: user.id,
    email: profile?.email ?? user.email ?? "",
    name: profile?.full_name ?? user.email ?? "",
    companyId: profile?.company_id ?? null,
    companyName,
    timeZone,
    roles: (roleRows ?? []).map((r) => r.role),
  };
});

/** For staff screens: signed in, with at least one staff role. */
export async function requireStaff(allowed: readonly AppRole[] = STAFF_ROLES) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.companyId || !hasAnyRole(viewer, STAFF_ROLES)) redirect("/waiting");
  if (!hasAnyRole(viewer, allowed)) redirect("/");
  return viewer as Viewer & { companyId: string };
}
