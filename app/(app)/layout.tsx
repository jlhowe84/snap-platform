import { requireStaff, hasAnyRole, OFFICE_ROLES, ADMIN_ROLES } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { PhoneBar, SideMenu } from "./menu";
import { CrewShell } from "./crew-shell";
import type { MenuGroup, MenuItem } from "@/lib/menu";
import { AskWidget } from "./ask-widget";
import { ASK_ROLES } from "@/lib/ask/roles";
import { ThemeToggle } from "@/components/theme-toggle";

// Ask SNAP can be asked from any page, and an answer can take a few lookups.
export const maxDuration = 60;

const glass = (size: number) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </svg>
);

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await requireStaff();
  const office = hasAnyRole(viewer, OFFICE_ROLES);
  const admin = hasAnyRole(viewer, ADMIN_ROLES);

  // Unread notices for the badge. RLS returns only this person's own.
  const supabase = await createClient();
  const { count: unread } = await supabase.from("notices").select("id", { count: "exact", head: true }).is("read_at", null);

  const desk = hasAnyRole(viewer, ["owner", "admin", "office", "support"]);
  const support = office || viewer.roles.includes("support");
  // Waiting work shows as a count on its menu entry, so nobody has to open a page to find out.
  const [{ count: needReply }, { count: drafts }] = support
    ? await Promise.all([
        supabase.from("support_conversations").select("id", { count: "exact", head: true }).in("status", ["new", "open"]),
        supabase.from("agent_actions").select("id", { count: "exact", head: true }).eq("status", "proposed"),
      ])
    : [{ count: 0 }, { count: 0 }];
  const crew = viewer.roles.includes("crew");

  // The menu, grouped by what the work is. A new staff page goes in the group
  // it belongs to; an empty group is dropped for roles that see none of it.
  const groups: MenuGroup[] = [
    {
      label: "Today",
      items: [
        { href: "/", label: "Today", show: desk },
        { href: "/owner", label: "Owner home", show: admin },
        { href: "/shifts", label: "My shifts", show: crew },
        { href: "/pay", label: "My pay", show: crew },
        { href: "/notices", label: "Notices", show: true, badge: unread ?? 0 },
        { href: "/tasks", label: "Tasks", show: desk },
        { href: "/calendar", label: "Calendar", show: desk },
      ],
    },
    {
      label: "Jobs",
      items: [
        { href: "/jobs", label: "Jobs", show: desk },
        { href: "/season", label: "Season", show: support },
        { href: "/leagues", label: "Leagues", show: support },
      ],
    },
    {
      label: "Customers",
      items: [
        { href: "/support", label: "Support", show: support, badge: needReply ?? 0 },
        { href: "/queue", label: "Queue", show: support, badge: drafts ?? 0 },
        { href: "/knowledge", label: "Knowledge", show: support },
      ],
    },
    {
      label: "People",
      items: [
        { href: "/staffing", label: "Staffing", show: office },
        { href: "/crew", label: "Crew", show: office },
        { href: "/crew/pay", label: "Crew pay", show: admin },
        { href: "/gear", label: "Gear", show: office },
      ],
    },
    {
      label: "Money",
      items: [
        { href: "/orders", label: "Orders", show: office },
        { href: "/lab", label: "Lab costs", show: office },
      ],
    },
    { label: "Admin", items: [{ href: "/settings", label: "Settings", show: admin }] },
  ]
    .map((g) => ({ label: g.label, items: g.items.filter((i) => i.show).map((i): MenuItem => ({ href: i.href, label: i.label, badge: "badge" in i ? i.badge : undefined })) }))
    .filter((g) => g.items.length);

  // The phone's bottom bar: the first four of these that this person can open.
  const all = groups.flatMap((g) => g.items);
  const quick = ["/", "/shifts", "/jobs", "/support", "/staffing", "/notices", "/tasks"]
    .map((h) => all.find((i) => i.href === h))
    .filter((i): i is MenuItem => !!i)
    .slice(0, 4);
  const roleLine = viewer.roles.map((r) => ROLE_LABEL[r]).join(", ");

  // Someone who is crew and nothing else gets the bright, simple layout: three
  // pages and no office menu.
  if (viewer.roles.every((r) => r === "crew")) {
    return (
      <CrewShell companyName={viewer.companyName ?? "Photo Day"} name={viewer.name} items={all}>
        {children}
      </CrewShell>
    );
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-line bg-surface print:hidden md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex h-full flex-col gap-5 px-4 py-3 md:p-5">
          <div className="flex items-center justify-between gap-3 md:block">
            <p className="font-display text-xl font-bold uppercase tracking-wide md:text-2xl">
              {viewer.companyName ?? "Photo Day"}
            </p>
            <p className="hidden text-[0.65rem] uppercase tracking-[0.18em] text-accent md:block md:text-xs">Photo Day Platform</p>
            {support && (
              <Link href="/search" aria-label="Search everything" className="-my-2 flex h-12 w-12 items-center justify-center rounded-lg text-muted hover:text-accent md:hidden">
                {glass(22)}
              </Link>
            )}
          </div>
          {support && (
            <form action="/search" role="search" className="relative hidden md:block">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">{glass(16)}</span>
              <input
                type="search"
                name="q"
                placeholder="Search everything"
                aria-label="Search everything"
                className="w-full rounded-lg border border-line bg-surface-2 py-2 pl-9 pr-3 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </form>
          )}
          <div className="hidden min-h-0 flex-1 flex-col md:flex">
            <SideMenu groups={groups} />
          </div>
          <div className="hidden text-xs text-muted md:block">
            <p className="truncate text-text">{viewer.name}</p>
            <p>{roleLine}</p>
            <div className="mt-3 flex items-center justify-between gap-4">
              <ThemeToggle className="-m-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text" />
              <form action="/auth/signout" method="post">
                <button className="text-muted underline-offset-2 hover:text-text hover:underline">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 pb-28 pt-6 print:pb-6 md:px-10 md:py-10">{children}</main>
      <PhoneBar groups={groups} quick={quick} name={viewer.name} roles={roleLine} />
      {hasAnyRole(viewer, ASK_ROLES) && <div className="print:hidden"><AskWidget /></div>}
    </div>
  );
}
