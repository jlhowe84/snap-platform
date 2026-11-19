import type { Metadata } from "next";
import { requireStaff, ADMIN_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill, StatusDot } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/labels";
import { InviteForm } from "./invite-form";
import { CapturaTest } from "./captura-test";
import { CompanySettingsForm } from "./company-settings";
import { EDITABLE_KEYS } from "@/lib/settings/editable";
import Link from "next/link";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();

  const [{ data: integrations }, { data: actionTypes }, { data: people }, { data: invites }, { data: settings }] =
    await Promise.all([
      supabase.from("integration_status").select("*").order("integration"),
      supabase.from("action_types").select("key, description, kind, autonomy_level").order("kind").order("key"),
      supabase.from("profiles").select("id, email, full_name, active, profile_roles(role)").order("email"),
      supabase.from("staff_invites").select("id, email, roles, used_at, created_at").is("used_at", null),
      supabase.from("settings").select("key, value").order("key"),
    ]);

  const never = (actionTypes ?? []).filter((a) => a.kind === "never");
  const earned = (actionTypes ?? []).filter((a) => a.kind !== "never");

  return (
    <>
      <PageHeader eyebrow="Admin" title="Settings" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Team">
          <ul className="mb-4 divide-y divide-line text-sm">
            {(people ?? [])
              .filter((p) => (p.profile_roles as { role: string }[]).some((r) => r.role !== "coordinator"))
              .map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{p.full_name ?? p.email}</span>
                <span className="flex flex-wrap gap-1">
                  {(p.profile_roles as { role: keyof typeof ROLE_LABEL }[]).map((r) => (
                    <Pill key={r.role} tone="accent">
                      {ROLE_LABEL[r.role]}
                    </Pill>
                  ))}
                </span>
              </li>
            ))}
            {(invites ?? []).map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-muted">
                <span>{i.email} (invited, not signed in yet)</span>
                <span className="flex gap-1">
                  {i.roles.map((r) => (
                    <Pill key={r}>{ROLE_LABEL[r]}</Pill>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <InviteForm />
        </Card>

        <Card title="Integrations">
          {integrations?.length ? (
            <ul className="divide-y divide-line text-sm">
              {integrations.map((i) => (
                <li key={i.integration} className="flex items-center justify-between py-2">
                  <span className="capitalize">{i.integration.replace(/_/g, " ")}</span>
                  {i.last_error ? (
                    <StatusDot tone="risk" label="Error" />
                  ) : i.last_success_at ? (
                    <StatusDot tone="ok" label={`Last run ${new Date(i.last_success_at).toLocaleString("en-US", { timeZone: "UTC" })} UTC`} />
                  ) : (
                    <StatusDot tone={i.enabled ? "warn" : "muted"} label={i.enabled ? "Waiting for first run" : "Not connected"} />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No integrations set up.</Empty>
          )}
          <CapturaTest />
        </Card>

        <Card title="Never without a person">
          <p className="mb-3 text-sm text-muted">
            The agent can flag these but never do them. The database enforces this list.
          </p>
          <ul className="space-y-2 text-sm">
            {never.map((a) => (
              <li key={a.key} className="flex items-start gap-2">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-risk" />
                <span>{a.description}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Agent actions and autonomy">
          <ul className="divide-y divide-line text-sm">
            {earned.map((a) => (
              <li key={a.key} className="flex items-center justify-between gap-3 py-2">
                <span>{a.description}</span>
                <Pill tone={a.autonomy_level >= 3 ? "accent" : "muted"}>{a.kind === "read" ? "Always allowed" : `Level ${a.autonomy_level} of 4`}</Pill>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="Photo day agreement"
          action={<Link href="/settings/agreement" className="text-sm text-accent hover:underline">Edit</Link>}
        >
          <p className="text-sm text-muted">
            The text league coordinators read, initial and sign in the portal. Signing confirms their held date.
          </p>
        </Card>

        <Card
          title="Planning steps"
          action={<Link href="/settings/steps" className="text-sm text-accent hover:underline">Edit</Link>}
        >
          <p className="text-sm text-muted">
            The steps each job follows: wording, timing, who does it, the order, and which ones show on the Captura setup list.
          </p>
        </Card>

        <Card title="Planning numbers" className="xl:col-span-2">
          <CompanySettingsForm
            values={Object.fromEntries(
              (settings ?? []).filter((s) => EDITABLE_KEYS.has(s.key)).map((s) => [s.key, typeof s.value === "number" ? s.value : null]),
            )}
          />
        </Card>

        <Card title="Other settings (read only)" className="xl:col-span-2">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            {(settings ?? []).filter((s) => !EDITABLE_KEYS.has(s.key)).map((s) => (
              <div key={s.key} className="contents">
                <dt className="font-mono text-muted">{s.key}</dt>
                <dd className="font-mono">{JSON.stringify(s.value)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}
