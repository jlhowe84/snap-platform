import type { Metadata } from "next";
import { requireStaff, ADMIN_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill, StatusDot } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/labels";
import { InviteForm } from "./invite-form";
import { RoleForm } from "./role-form";
import { editableRoles } from "@/lib/team/roles";
import { CapturaTest } from "./captura-test";
import { CompanySettingsForm } from "./company-settings";
import { InvoiceFolder } from "./invoice-folder";
import { CrewTexts } from "./texts";
import { smsSettingsFrom } from "@/lib/sms/guard";
import { formatUsMobile } from "@/lib/sms/phone";
import { twilioKeys } from "@/lib/sms/twilio";
import { liveSiteUrl } from "@/lib/site-url";
import { headers } from "next/headers";
import { todayIn } from "@/lib/dates";
import { addDays } from "@/lib/makeups/schedule";
import { loadServiceAccount } from "@/lib/gmail/client";
import { EDITABLE_KEYS } from "@/lib/settings/editable";
import Link from "next/link";
import { ConnectHelper } from "./helper";
import { ConfirmButton } from "@/components/confirm-button";
import { disconnectHelper } from "./helper-actions";

export const metadata: Metadata = { title: "Settings" };

const TABS = [
  ["team", "Team"],
  ["planning", "Planning"],
  ["integrations", "Integrations"],
  ["assistant", "Assistant"],
  ["advanced", "Advanced"],
] as const;
type Tab = (typeof TABS)[number][0];

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const sp = await searchParams;
  const tab: Tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? "team";
  const viewer = await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();
  // The service account's own address is not a secret: a folder is shared with it.
  const platformAddress = viewer.companyId
    ? await loadServiceAccount(viewer.companyId).then((sa) => sa?.client_email ?? null).catch(() => null)
    : null;

  const [{ data: integrations }, { data: actionTypes }, { data: people }, { data: invites }, { data: settings }] =
    await Promise.all([
      supabase.from("integration_status").select("*").order("integration"),
      supabase.from("action_types").select("key, description, kind, autonomy_level").order("kind").order("key"),
      supabase.from("profiles").select("id, email, full_name, active, profile_roles(role)").order("email"),
      supabase.from("staff_invites").select("id, email, roles, used_at, created_at").is("used_at", null),
      supabase.from("settings").select("key, value").order("key"),
    ]);

  const { data: helpers } = tab === "integrations"
    ? await supabase.from("helper_devices").select("id, name, created_at, last_seen_at, last_version, last_report, revoked_at").order("created_at", { ascending: false })
    : { data: null };
  const sms = smsSettingsFrom(settings ?? []);
  const since = addDays(todayIn(viewer.timeZone), -30);
  const { data: recentTexts } = tab === "integrations"
    ? await supabase.from("text_messages").select("status").gte("created_at", since).limit(5000)
    : { data: null };
  const textCounts = { logged: 0, sent: 0, skipped: 0, failed: 0 };
  for (const t of recentTexts ?? []) if (t.status in textCounts) textCounts[t.status as keyof typeof textCounts]++;
  const textsStatus = {
    enabled: sms.enabled,
    testMode: sms.testMode,
    testNumber: sms.testRecipient ? formatUsMobile(sms.testRecipient) : "",
    keysSet: twilioKeys() !== null,
    webhookUrl: `${liveSiteUrl(await headers())}/api/sms/inbound`,
    counts: textCounts,
  };

  const editable = editableRoles(viewer.roles);
  const never =(actionTypes ?? []).filter((a) => a.kind === "never");
  const earned = (actionTypes ?? []).filter((a) => a.kind !== "never");

  return (
    <>
      <PageHeader eyebrow="Admin" title="Settings" />
      {/* The tabs wrap on a narrow screen; nothing scrolls sideways. */}
      <nav aria-label="Settings sections" className="mb-6 flex flex-wrap gap-2">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={key === "team" ? "/settings" : `/settings?tab=${key}`}
            aria-current={key === tab ? "page" : undefined}
            className={
              "rounded-lg border px-4 py-2.5 text-sm font-medium " +
              (key === tab ? "border-accent bg-accent text-accent-ink" : "border-line text-muted hover:border-accent hover:text-accent")
            }
          >
            {label}
          </Link>
        ))}
        <Link href="/settings/messages" className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-muted hover:border-accent hover:text-accent">
          Messages
        </Link>
      </nav>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 [&>*]:min-w-0">
        {tab === "team" && (
        <Card title="Team" className="xl:col-span-2">
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
                {editable.length > 0 && (
                  <RoleForm
                    profileId={p.id}
                    name={p.full_name ?? p.email ?? "this person"}
                    current={(p.profile_roles as { role: string }[]).map((r) => r.role)}
                    editable={editable}
                  />
                )}
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
        )}

        {tab === "integrations" && (
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
        )}

        {tab === "integrations" && (
        <Card title="iMac helper">
          <p className="mb-3 text-sm text-muted">
            A small script on the production iMac. When a job starts production it makes the job&apos;s PHOTO IMPORT folder and Capture One session, and every
            few minutes it reports image counts per folder and whether the NAS copy is there. It never sends images, file names or passwords. Setup steps are in
            the helper&apos;s README in the platform repository.
          </p>
          {helpers?.length ? (
            <ul className="mb-4 divide-y divide-line text-sm">
              {helpers.map((h) => {
                const r = (h.last_report ?? {}) as { photo_import?: boolean; nas?: boolean; problem?: string | null };
                return (
                  <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-semibold">{h.name}</span>{" "}
                      <span className="text-muted">
                        {h.revoked_at
                          ? "disconnected"
                          : h.last_seen_at
                            ? `last report ${new Date(h.last_seen_at).toLocaleString("en-US", { timeZone: viewer.timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}${h.last_version ? `, version ${h.last_version}` : ""}${r.photo_import === false ? ", PHOTO IMPORT not found" : ""}${r.nas === false ? ", NAS not mounted" : ""}`
                            : "waiting for its first report"}
                      </span>
                      {r.problem && <span className="block text-xs text-risk">{r.problem}</span>}
                    </span>
                    {!h.revoked_at && (
                      <form action={disconnectHelper.bind(null, h.id)}>
                        <ConfirmButton ask="Disconnect this computer? Its key stops working." className="text-xs text-muted hover:text-risk">
                          Disconnect
                        </ConfirmButton>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
          <ConnectHelper siteUrl={liveSiteUrl(await headers())} />
        </Card>
        )}

        {tab === "assistant" && (
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
        )}

        {tab === "assistant" && (
        <Card title="Test set" action={<Link href="/settings/test-set" className="text-sm text-muted hover:text-accent">Open</Link>}>
          <p className="text-sm text-muted">
            Past conversations with the right answer, and trick emails. Run it before changing a saved reply, a knowledge base article or the model.
          </p>
        </Card>
        )}

        {tab === "assistant" && (
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
        )}

        {tab === "planning" && (
        <Card
          title="Photo day agreement"
          action={<Link href="/settings/agreement" className="text-sm text-accent hover:underline">Edit</Link>}
        >
          <p className="text-sm text-muted">
            The text league coordinators read, initial and sign in the portal. Signing confirms their held date.
          </p>
        </Card>
        )}

        {tab === "planning" && (
        <Card
          title="Makeups and retakes"
          action={<Link href="/settings/makeups" className="text-sm text-accent hover:underline">Edit</Link>}
        >
          <p className="text-sm text-muted">
            When parents can book a makeup or retake: open days and hours, session length, blackout dates and the words on the booking page.
          </p>
        </Card>
        )}

        {tab === "planning" && (
        <Card
          title="Planning steps"
          action={<Link href="/settings/steps" className="text-sm text-accent hover:underline">Edit</Link>}
        >
          <p className="text-sm text-muted">
            The steps each job follows: wording, timing, who does it, the order, and which ones show on the Captura setup list.
          </p>
        </Card>
        )}

        {tab === "integrations" && (
        <Card title="Crew texts" className="xl:col-span-2">
          <CrewTexts status={textsStatus} />
        </Card>
        )}

        {tab === "integrations" && (
        <Card title="Lab invoices" className="xl:col-span-2">
          <InvoiceFolder
            platformAddress={platformAddress}
            folderId={(() => {
              const v = (settings ?? []).find((x) => x.key === "lab.invoice_drive_folder")?.value;
              return typeof v === "string" ? v : null;
            })()}
          />
        </Card>
        )}

        {tab === "planning" && (
        <Card title="Planning numbers" className="xl:col-span-2">
          <CompanySettingsForm
            values={Object.fromEntries(
              (settings ?? []).filter((s) => EDITABLE_KEYS.has(s.key)).map((s) => [s.key, typeof s.value === "number" ? s.value : null]),
            )}
          />
        </Card>
        )}

        {tab === "advanced" && (
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
        )}
      </div>
    </>
  );
}
