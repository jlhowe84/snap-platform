"use client";

import { useActionState, useState } from "react";
import { useToast } from "@/components/toast";
import { formatTime } from "@/lib/dates";
import { DELIVERY_CHOICE_LABEL, SETUP_LABEL, timeChoices, type PlanningAnswers } from "@/lib/planning/form";
import { savePlanning, type PlanningState } from "./actions";

const field = "mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none";
const label = "block text-sm font-medium";
const hint = "mt-1 text-xs text-muted";
const group = "rounded-xl border border-line bg-surface p-5";
const heading = "mb-4 font-display text-lg font-semibold uppercase tracking-wider";

function Choice({
  name,
  value,
  current,
  onPick,
  title,
  detail,
  disabled,
}: {
  name: string;
  value: string;
  current: string;
  onPick: (v: string) => void;
  title: string;
  detail?: string;
  disabled: boolean;
}) {
  const on = current === value;
  return (
    <label
      className={`flex-1 cursor-pointer rounded-lg border p-3 text-sm ${on ? "border-accent bg-surface-2" : "border-line hover:bg-surface-2"}`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={on}
        onChange={() => onPick(value)}
        disabled={disabled}
        className="sr-only"
      />
      <span className="font-semibold">{title}</span>
      {detail && <span className="mt-1 block text-xs text-muted">{detail}</span>}
    </label>
  );
}

export function PlanningForm({
  jobId,
  answers,
  canEdit,
  submitted,
}: {
  jobId: string;
  answers: PlanningAnswers;
  canEdit: boolean;
  submitted: boolean;
}) {
  const [state, action, pending] = useActionState<PlanningState, FormData>(savePlanning.bind(null, jobId), null);
  useToast(state);
  const [setup, setSetup] = useState<string>(answers.setup ?? "");
  const [delivery, setDelivery] = useState<string>(answers.delivery ?? "");
  const off = !canEdit || pending;

  return (
    <form action={action} className="space-y-4">
      <section className={group}>
        <h2 className={heading}>The day</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={label}>
            When should the first group be ready?
            <select key={String(answers.first_group_time ?? "")} name="first_group_time" defaultValue={answers.first_group_time ?? ""} disabled={off} className={field}>
              <option value="">Choose a time</option>
              {timeChoices().map((t) => (
                <option key={t} value={t}>
                  {formatTime(t)}
                </option>
              ))}
            </select>
            <span className={hint}>Our crew arrives ahead of this to set up.</span>
          </label>
          <div>
            <p className={label}>Where will we set up?</p>
            <div className="mt-1 flex gap-2">
              {(Object.keys(SETUP_LABEL) as (keyof typeof SETUP_LABEL)[]).map((k) => (
                <Choice key={k} name="setup" value={k} current={setup} onPick={setSetup} title={SETUP_LABEL[k]} disabled={off} />
              ))}
            </div>
            <p className={hint}>Indoors means no weather delays. A gym corner, cafeteria or foyer works for us.</p>
          </div>
        </div>
      </section>

      <section className={group}>
        <h2 className={heading}>The place</h2>
        <label className={label}>
          Venue name or address
          <input name="venue" defaultValue={answers.venue ?? ""} maxLength={300} disabled={off} className={field} />
        </label>
        <label className={`${label} mt-4`}>
          How do we find you when we get there?
          <textarea
            name="arrival_notes"
            defaultValue={answers.arrival_notes ?? ""}
            rows={3}
            maxLength={2000}
            disabled={off}
            placeholder="Which door, which room or field, where to park and unload."
            className={field}
          />
          <span className={hint}>This goes to the crew on photo day.</span>
        </label>
      </section>

      <section className={group}>
        <h2 className={heading}>Your groups</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={label}>
            About how many teams or groups?
            <input name="team_count" type="number" min={0} max={5000} defaultValue={answers.team_count ?? ""} disabled={off} placeholder="A rough number is fine" className={field} />
          </label>
          <label className={label}>
            About how many athletes?
            <input name="athlete_count" type="number" min={0} max={5000} defaultValue={answers.athlete_count ?? ""} disabled={off} className={field} />
          </label>
        </div>
        <label className={`${label} mt-4`}>
          Sponsor names to print on team photos <span className="font-normal text-muted">(optional)</span>
          <textarea name="sponsors" defaultValue={answers.sponsors ?? ""} rows={2} maxLength={2000} disabled={off} placeholder="Leave blank if there are none. You can also add them per team in the schedule step." className={field} />
        </label>
      </section>

      <section className={group}>
        <h2 className={heading}>How orders get to families</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Choice name="delivery" value="club" current={delivery} onPick={setDelivery} title={DELIVERY_CHOICE_LABEL.club} detail="One shipment, sorted by team, for you to hand out." disabled={off} />
          <Choice name="delivery" value="home" current={delivery} onPick={setDelivery} title={DELIVERY_CHOICE_LABEL.home} detail="Each family's order ships to their own address." disabled={off} />
        </div>
        {delivery === "club" && (
          <label className={`${label} mt-4`}>
            Where should we send the league&apos;s box?
            <input name="delivery_address" defaultValue={answers.delivery_address ?? ""} maxLength={500} disabled={off} placeholder="Name and mailing address" className={field} />
          </label>
        )}
      </section>

      <section className={group}>
        <h2 className={heading}>Anything else</h2>
        <label className={label}>
          Anything we should know? <span className="font-normal text-muted">(optional)</span>
          <textarea name="notes" defaultValue={answers.notes ?? ""} rows={3} maxLength={2000} disabled={off} className={field} />
        </label>
      </section>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4">
          <button
            name="intent"
            value="send"
            disabled={pending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60"
          >
            {pending ? "Saving…" : submitted ? "Send changes" : "Send what I have"}
          </button>
          {!submitted && (
            <button name="intent" value="save" disabled={pending} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-surface-2 disabled:opacity-60">
              Save for later
            </button>
          )}
          {state && <p className={state.ok ? "text-sm text-ok" : "text-sm text-risk"}>{state.message}</p>}
        </div>
      )}
    </form>
  );
}
