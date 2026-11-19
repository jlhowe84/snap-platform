import { requireStaff, hasAnyRole, OFFICE_ROLES, ADMIN_ROLES } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { NavLink } from "./nav-link";
import { AskWidget } from "./ask-widget";
import { ASK_ROLES } from "@/lib/ask/roles";

// Ask SNAP can be asked from any page, and an answer can take a few lookups.
export const maxDuration = 60;

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await requireStaff();
  const office = hasAnyRole(viewer, OFFICE_ROLES);
  const admin = hasAnyRole(viewer, ADMIN_ROLES);

  // Unread notices for the badge. RLS returns only this person's own.
  const supabase = await createClient();
  const { count: unread } = await supabase.from("notices").select("id", { count: "exact", head: true }).is("read_at", null);

  const nav = [
    { href: "/", label: "Today", show: true },
    { href: "/notices", label: unread ? `Notices (${unread})` : "Notices", show: true },
    { href: "/tasks", label: "Tasks", show: true },
    { href: "/calendar", label: "Calendar", show: true },
    { href: "/ask", label: "Ask SNAP", show: office || viewer.roles.includes("support") },
    { href: "/jobs", label: "Jobs", show: true },
    { href: "/queue", label: "Queue", show: office || viewer.roles.includes("support") },
    { href: "/season", label: "Season", show: office || viewer.roles.includes("support") },
    { href: "/leagues", label: "Leagues", show: office || viewer.roles.includes("support") },
    { href: "/crew", label: "Crew", show: office },
    { href: "/settings", label: "Settings", show: admin },
  ].filter((n) => n.show);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex h-full flex-col gap-6 p-4 md:p-5">
          <div>
            <p className="font-display text-2xl font-bold uppercase tracking-wide">
              {viewer.companyName ?? "Photo Day"}
            </p>
            <p className="text-xs uppercase tracking-[0.18em] text-accent">Photo Day Platform</p>
          </div>
          <nav className="flex gap-1 overflow-x-auto md:flex-col">
            {nav.map((n) => (
              <NavLink key={n.href} href={n.href}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto hidden text-xs text-muted md:block">
            <p className="truncate text-text">{viewer.name}</p>
            <p>{viewer.roles.map((r) => ROLE_LABEL[r]).join(", ")}</p>
            <form action="/auth/signout" method="post" className="mt-3">
              <button className="text-muted underline-offset-2 hover:text-text hover:underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-10">{children}</main>
      {hasAnyRole(viewer, ASK_ROLES) && <AskWidget />}
    </div>
  );
}
