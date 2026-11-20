import Link from "next/link";
import type { ReactNode } from "react";
import { requireStaff, hasAnyRole, OFFICE_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatRange } from "@/lib/dates";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/labels";
import { searchTerm } from "@/lib/support/preview";

const EACH = 8;

function Hit({ href, title, detail, aside }: { href: string; title: string; detail?: string | null; aside?: ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex min-h-12 items-center justify-between gap-3 py-2.5 hover:text-accent">
        <span className="min-w-0">
          <span className="block font-medium [overflow-wrap:anywhere]">{title}</span>
          {detail && <span className="block text-sm text-muted [overflow-wrap:anywhere]">{detail}</span>}
        </span>
        {aside && <span className="shrink-0">{aside}</span>}
      </Link>
    </li>
  );
}

function Group({ title, count, more, children }: { title: string; count: number; more?: { href: string; label: string }; children: ReactNode }) {
  if (!count) return null;
  return (
    <Card title={title} action={more && count >= EACH ? <Link href={more.href} className="text-sm text-accent hover:underline">{more.label}</Link> : undefined}>
      <ul className="divide-y divide-line">{children}</ul>
    </Card>
  );
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const viewer = await requireStaff(["owner", "admin", "office", "support"]);
  const sp = await searchParams;
  const q = searchTerm(typeof sp.q === "string" ? sp.q : undefined);
  const office = hasAnyRole(viewer, OFFICE_ROLES);
  // Quoted, so a dot or a space in what was typed stays part of the value.
  const like = `"%${q}%"`;
  const enc = encodeURIComponent(q);

  // Row-level security decides what each person may see, so a role that
  // cannot open a table simply gets nothing back from it.
  const supabase = await createClient();
  const found = q.length >= 2
    ? await Promise.all([
        supabase
          .from("job_overview")
          .select("id, name, org_name, season, first_date, last_date, status")
          .or(`name.ilike.${like},org_name.ilike.${like}`)
          .order("first_date", { ascending: false, nullsFirst: false })
          .limit(EACH),
        supabase.from("organizations").select("id, name, short_name, active").or(`name.ilike.${like},short_name.ilike.${like}`).order("name").limit(EACH),
        supabase
          .from("contacts")
          .select("id, full_name, email, phone, role_title, organization_contacts(org_id, organizations(name)), job_contacts(job_id, jobs(name))")
          .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
          .order("full_name")
          .limit(EACH),
        supabase
          .from("teams")
          .select("id, name, division, coach_name, job_id, jobs(name)")
          .or(`name.ilike.${like},coach_name.ilike.${like}`)
          .order("updated_at", { ascending: false })
          .limit(EACH),
        supabase
          .from("support_conversations")
          .select("id, subject, customer_name, customer_email, status, last_message_at")
          .or(`subject.ilike.${like},customer_name.ilike.${like},customer_email.ilike.${like}`)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(EACH),
        supabase.from("kb_articles").select("id, title, section").ilike("title", `%${q}%`).order("title").limit(EACH),
        office
          ? supabase
              .from("lab_invoice_orders")
              .select("id, invoice_id, customer_name, reference, captura_order_number, lab_order_number")
              .or(`captura_order_number.eq."${q}",lab_order_number.eq."${q}",customer_name.ilike.${like},reference.ilike.${like}`)
              .limit(EACH)
          : Promise.resolve({ data: [] as never[] }),
      ])
    : null;

  const jobs = found?.[0].data ?? [];
  const leagues = found?.[1].data ?? [];
  const contacts = found?.[2].data ?? [];
  const teams = found?.[3].data ?? [];
  const talks = found?.[4].data ?? [];
  const articles = found?.[5].data ?? [];
  const orders = found?.[6].data ?? [];
  const total = jobs.length + leagues.length + contacts.length + teams.length + talks.length + articles.length + orders.length;
  const when = new Intl.DateTimeFormat("en-US", { timeZone: viewer.timeZone, month: "short", day: "numeric", year: "numeric" });

  return (
    <>
      <PageHeader eyebrow="Search" title={q ? `Results for "${q}"` : "Search everything"} back={{ href: "/", label: "Close search" }} />

      <form action="/search" className="mb-6 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="A league, job, person, team, email or order number"
          aria-label="Search everything"
          className="min-h-12 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-base placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <SubmitButton className="rounded-lg bg-accent px-4 font-semibold text-accent-ink">Search</SubmitButton>
      </form>

      {!found && <Empty>Type at least two letters. Search looks through jobs, leagues, contacts, teams, support conversations, the knowledge base and lab orders.</Empty>}
      {found && !total && <Empty>Nothing matched &quot;{q}&quot;. Try fewer letters, a last name or an email address.</Empty>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Group title="Jobs" count={jobs.length} more={{ href: `/jobs?q=${enc}`, label: "All matching jobs" }}>
          {jobs.map((j) => (
            <Hit
              key={j.id}
              href={`/jobs/${j.id}`}
              title={j.name ?? "Job"}
              detail={[j.org_name, j.season, formatRange(j.first_date, j.last_date)].filter(Boolean).join(" · ")}
              aside={j.status && <Pill tone={STATUS_TONE[j.status]}>{STATUS_LABEL[j.status]}</Pill>}
            />
          ))}
        </Group>

        <Group title="Leagues" count={leagues.length}>
          {leagues.map((o) => (
            <Hit key={o.id} href={`/leagues/${o.id}`} title={o.name} detail={o.short_name} aside={!o.active && <Pill>Not active</Pill>} />
          ))}
        </Group>

        <Group title="Contacts" count={contacts.length}>
          {contacts.map((c) => {
            const org = c.organization_contacts[0];
            const job = c.job_contacts[0];
            const href = org ? `/leagues/${org.org_id}` : job ? `/jobs/${job.job_id}` : `/support?q=${encodeURIComponent(c.email ?? c.full_name)}`;
            const where = org?.organizations?.name ?? job?.jobs?.name;
            return <Hit key={c.id} href={href} title={c.full_name} detail={[c.role_title, where, c.email, c.phone].filter(Boolean).join(" · ")} />;
          })}
        </Group>

        <Group title="Teams" count={teams.length}>
          {teams.map((t) => (
            <Hit
              key={t.id}
              href={`/jobs/${t.job_id}`}
              title={t.name}
              detail={[t.division, t.coach_name && `Coach ${t.coach_name}`, t.jobs?.name].filter(Boolean).join(" · ")}
            />
          ))}
        </Group>

        <Group title="Support conversations" count={talks.length} more={{ href: `/support?q=${enc}`, label: "All matching conversations" }}>
          {talks.map((t) => (
            <Hit
              key={t.id}
              href={`/support/${t.id}`}
              title={t.subject || "No subject"}
              detail={[t.customer_name ?? t.customer_email, t.last_message_at && when.format(new Date(t.last_message_at))].filter(Boolean).join(" · ")}
              aside={(t.status === "new" || t.status === "open") && <Pill tone="warn">Needs a reply</Pill>}
            />
          ))}
        </Group>

        <Group title="Knowledge base" count={articles.length} more={{ href: `/knowledge?q=${enc}`, label: "Search the knowledge base" }}>
          {articles.map((a) => (
            <Hit key={a.id} href={`/knowledge/${a.id}`} title={a.title} detail={a.section} />
          ))}
        </Group>

        <Group title="Lab orders" count={orders.length} more={{ href: `/lab/invoices?q=${enc}`, label: "All matching orders" }}>
          {orders.map((o) => (
            <Hit
              key={o.id}
              href={`/lab/invoices/${o.invoice_id}`}
              title={o.customer_name ?? o.reference ?? "Order"}
              detail={[o.captura_order_number && `Captura ${o.captura_order_number}`, o.lab_order_number && `Lab ${o.lab_order_number}`, o.reference].filter(Boolean).join(" · ")}
            />
          ))}
        </Group>
      </div>
    </>
  );
}
