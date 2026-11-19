import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff, ADMIN_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pill, cx } from "@/components/ui";
import { CAPTURA_TAG } from "@/lib/captura/setup";
import { timingLabel } from "@/lib/playbooks/steps";
import { moveStep } from "./actions";
import { StepForm } from "./step-form";

export const metadata: Metadata = { title: "Planning steps" };

const KIND_LABEL: Record<string, string> = { planning: "Planning steps", production: "Production steps" };
const arrow = "rounded border border-line px-2 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-30 disabled:hover:border-line disabled:hover:text-inherit";

// The steps every job follows, as an owner or admin sets them. Staff can read
// the steps anywhere they show; only this page changes them.
export default async function StepsSettings({ searchParams }: PageProps<"/settings/steps">) {
  await requireStaff(ADMIN_ROLES);
  const { list: wanted } = await searchParams;
  const supabase = await createClient();
  const [{ data: playbooks }, { data: steps }] = await Promise.all([
    supabase.from("playbooks").select("id, name, kind, notes").eq("active", true).order("kind"),
    supabase
      .from("playbook_steps")
      .select("id, playbook_id, position, name, description, stage, offset_days, owner_hint, tags, active")
      .order("position")
      .order("created_at"),
  ]);
  // One list shows at a time; the tabs pick which.
  const shown = (playbooks ?? []).find((p) => p.id === wanted) ?? playbooks?.[0];
  const stages = [...new Set((steps ?? []).map((s) => s.stage).filter((s): s is string => !!s))];

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/settings" className="text-muted hover:text-text">
          ← Settings
        </Link>
      </p>
      <PageHeader eyebrow="Admin" title="Planning steps" />
      <p className="mb-6 max-w-2xl text-sm text-muted">
        The steps each job follows. Change the wording, the timing, who does it and the order. Switch a step off to stop
        using it; nothing is removed, so tasks already made from it stay as they are. Changes apply from now on.
      </p>

      {!playbooks?.length && <Empty>No step lists yet.</Empty>}
      {(playbooks?.length ?? 0) > 1 && (
        <nav aria-label="Step lists" className="mb-4 flex flex-wrap gap-1 border-b border-line">
          {(playbooks ?? []).map((p) => (
            <Link
              key={p.id}
              href={`/settings/steps?list=${p.id}`}
              aria-current={p.id === shown?.id ? "page" : undefined}
              className={cx(
                "-mb-px border-b-2 px-4 py-2 text-sm font-medium",
                p.id === shown?.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-text",
              )}
            >
              {KIND_LABEL[p.kind] ?? p.name}
            </Link>
          ))}
        </nav>
      )}
      <div className="space-y-8">
        {(shown ? [shown] : []).map((p) => {
          const list = (steps ?? []).filter((s) => s.playbook_id === p.id);
          const inUse = list.filter((s) => s.active).length;
          return (
            <Card key={p.id} title={`${KIND_LABEL[p.kind] ?? p.name} (${inUse} in use${list.length > inUse ? `, ${list.length - inUse} off` : ""})`}>
              {list.length ? (
                <ol className="divide-y divide-line">
                  {list.map((s, i) => (
                    <li key={s.id} className="py-3">
                      <div className="flex items-start gap-3">
                        <div className="flex shrink-0 flex-col gap-1 pt-0.5">
                          <form action={moveStep.bind(null, s.id, "up")}>
                            <button disabled={i === 0} className={arrow} aria-label={`Move "${s.name}" up`}>↑</button>
                          </form>
                          <form action={moveStep.bind(null, s.id, "down")}>
                            <button disabled={i === list.length - 1} className={arrow} aria-label={`Move "${s.name}" down`}>↓</button>
                          </form>
                        </div>
                        <details className="min-w-0 flex-1">
                          <summary className="cursor-pointer">
                            <span className={cx("text-sm font-medium", !s.active && "text-muted line-through")}>
                              {i + 1}. {s.name}
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                              {s.stage && <span>{s.stage}</span>}
                              <span>{timingLabel(s.offset_days)}</span>
                              {s.owner_hint && <span>{s.owner_hint}</span>}
                              {s.tags.includes(CAPTURA_TAG) && <Pill tone="info">Captura</Pill>}
                              {!s.active && <Pill>Off</Pill>}
                            </span>
                          </summary>
                          <div className="mt-3 rounded-lg border border-line p-3">
                            <StepForm
                              stepId={s.id}
                              stages={stages}
                              listId={`stages-${s.id}`}
                              values={{
                                name: s.name,
                                stage: s.stage,
                                owner_hint: s.owner_hint,
                                description: s.description,
                                offset_days: s.offset_days,
                                captura: s.tags.includes(CAPTURA_TAG),
                                active: s.active,
                              }}
                            />
                          </div>
                        </details>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <Empty>No steps in this list yet.</Empty>
              )}
              <details className="mt-4 border-t border-line pt-4">
                <summary className="cursor-pointer text-sm text-accent hover:underline">Add a step</summary>
                <div className="mt-3 rounded-lg border border-line p-3">
                  <StepForm playbookId={p.id} stages={stages} listId={`stages-new-${p.id}`} />
                </div>
              </details>
            </Card>
          );
        })}
      </div>
    </>
  );
}
