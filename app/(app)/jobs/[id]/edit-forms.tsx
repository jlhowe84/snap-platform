"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useToast } from "@/components/toast";
import { DELIVERY_LABEL, STAGE_LABEL, STATUS_LABEL } from "@/lib/labels";
import {
  DELIVERY_METHODS, HAND_STATUSES, HOLD_STATUSES, JOB_TYPES, JOB_TYPE_LABEL, LABS, LAB_LABEL, PROGRAMS, PROGRAM_LABEL,
  SALE_MODES, SALE_MODE_LABEL, STAGE_VALUES, TEAM_PHOTO_LABEL, TEAM_PHOTO_TYPES, VENUES, VENUE_LABEL,
} from "@/lib/jobs/edit";
import type { Database } from "@/lib/database.types";
import { saveJobDetails, saveJobLinks, savePhotoDay, type EditState } from "./edit-actions";

type Job = Database["public"]["Tables"]["jobs"]["Row"];
type Day = Database["public"]["Tables"]["photo_days"]["Row"];

const field = "mt-1 min-h-12 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none disabled:opacity-60 sm:min-h-0";
const label = "block min-w-0 text-xs text-muted";
const grid = "grid grid-cols-1 gap-3 sm:grid-cols-2";
const editLink = "flex min-h-12 items-center text-sm font-medium text-accent hover:underline sm:min-h-0";
const group = "mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-muted first:mt-0";

/** Runs a save action and closes the form when it worked. */
function useEditor(save: (prev: EditState, form: FormData) => Promise<EditState>) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<EditState, FormData>(async (prev, form) => {
    const result = await save(prev, form);
    if (result?.ok) setOpen(false);
    return result;
  }, null);
  useToast(state);
  return { open, setOpen, state, action, pending };
}

function Buttons({ pending, onCancel, state }: { pending: boolean; onCancel: () => void; state: EditState }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button disabled={pending} className="min-h-12 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60 sm:min-h-0">
        {pending ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={onCancel} disabled={pending} className="min-h-12 rounded-lg border border-line px-4 py-2 text-sm hover:border-accent sm:min-h-0">
        Cancel
      </button>
      {state && !state.ok && <p className="text-sm text-risk">{state.message}</p>}
    </div>
  );
}

function Options<T extends string>({ values, labels }: { values: readonly T[]; labels: Record<T, string> }) {
  return values.map((v) => <option key={v} value={v}>{labels[v]}</option>);
}

/** The Details card: the facts as read, and the same facts as a form. */
export function JobDetailsEditor({ job, leagues, children }: { job: Job; leagues: { id: string; name: string }[]; children: ReactNode }) {
  const { open, setOpen, state, action, pending } = useEditor(saveJobDetails.bind(null, job.id));
  if (!open) {
    return (
      <>
        {children}
        <button type="button" onClick={() => setOpen(true)} className={editLink + " mt-3"}>Edit details</button>
      </>
    );
  }
  const onHold = HOLD_STATUSES.includes(job.status);
  const byTasks = !!job.production_started_at;
  return (
    <form action={action}>
      <p className={group}>Job</p>
      <div className={grid}>
        <label className={label + " sm:col-span-2"}>
          Job name
          <input name="name" required maxLength={200} defaultValue={job.name} className={field} />
        </label>
        <label className={label + " sm:col-span-2"}>
          League
          <select key={String(job.org_id ?? "")} name="org_id" defaultValue={job.org_id ?? ""} className={field}>
            <option value="">Not linked</option>
            {leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label className={label}>
          Status
          {onHold ? (
            <>
              <input type="hidden" name="status" value={job.status} />
              <select disabled defaultValue={job.status} className={field}>
                <option value={job.status}>{STATUS_LABEL[job.status]}</option>
              </select>
            </>
          ) : (
            <select key={String(job.status)} name="status" defaultValue={job.status} className={field}>
              <Options values={HAND_STATUSES} labels={STATUS_LABEL} />
            </select>
          )}
        </label>
        <label className={label}>
          Production stage
          <select key={String(job.production_stage ?? "")} name={byTasks ? undefined : "production_stage"} disabled={byTasks} defaultValue={job.production_stage ?? ""} className={field}>
            <option value="">None</option>
            <Options values={STAGE_VALUES} labels={STAGE_LABEL} />
          </select>
        </label>
      </div>
      {(onHold || byTasks) && (
        <p className="mt-2 text-xs text-muted">
          {onHold ? "A held or released date changes on the Season board, where its hold is confirmed or released. " : ""}
          {byTasks ? "The stage follows this job's production tasks: finish or reopen a task to move it." : ""}
        </p>
      )}

      <p className={group}>Production</p>
      <div className={grid}>
        <label className={label}>
          Lab
          <select key={String(job.lab ?? "")} name="lab" defaultValue={job.lab ?? ""} className={field}>
            <option value="">Not set</option>
            <Options values={LABS} labels={LAB_LABEL} />
          </select>
        </label>
        <label className={label}>
          Delivery
          <select key={String(job.delivery_method ?? "")} name="delivery_method" defaultValue={job.delivery_method ?? ""} className={field}>
            <option value="">Not set</option>
            <Options values={DELIVERY_METHODS} labels={DELIVERY_LABEL} />
          </select>
        </label>
        <label className={label}>
          Team photo
          <select key={String(job.team_photo_type ?? "")} name="team_photo_type" defaultValue={job.team_photo_type ?? ""} className={field}>
            <option value="">Not set</option>
            <Options values={TEAM_PHOTO_TYPES} labels={TEAM_PHOTO_LABEL} />
          </select>
        </label>
        <label className={label}>
          Sale
          <select key={String(job.sale_mode)} name="sale_mode" defaultValue={job.sale_mode} className={field}>
            <Options values={SALE_MODES} labels={SALE_MODE_LABEL} />
          </select>
        </label>
      </div>

      <p className={group}>About the job</p>
      <div className={grid}>
        <label className={label}>
          Type
          <select key={String(job.job_type)} name="job_type" defaultValue={job.job_type} className={field}>
            <Options values={JOB_TYPES} labels={JOB_TYPE_LABEL} />
          </select>
        </label>
        <label className={label}>
          Program
          <select key={String(job.program)} name="program" defaultValue={job.program} className={field}>
            <Options values={PROGRAMS} labels={PROGRAM_LABEL} />
          </select>
        </label>
        <label className={label}>
          Where
          <select key={String(job.venue)} name="venue" defaultValue={job.venue} className={field}>
            <Options values={VENUES} labels={VENUE_LABEL} />
          </select>
        </label>
        <label className={label}>
          Sports (separate with commas)
          <input name="sports" maxLength={300} defaultValue={job.sports.join(", ")} placeholder="Baseball, Softball" className={field} />
        </label>
        <label className={label}>
          Teams expected
          <input name="expected_teams" type="number" min={0} max={2000} inputMode="numeric" defaultValue={job.expected_teams ?? ""} className={field} />
        </label>
        <label className={label}>
          Players expected
          <input name="expected_subjects" type="number" min={0} max={20000} inputMode="numeric" defaultValue={job.expected_subjects ?? ""} className={field} />
        </label>
        <label className={label}>
          Sponsors
          <select key={String(job.sponsors == null ? "" : job.sponsors ? "yes" : "no")} name="sponsors" defaultValue={job.sponsors == null ? "" : job.sponsors ? "yes" : "no"} className={field}>
            <option value="">Unknown</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <label className={label}>
          Coupon code
          <input name="coupon" maxLength={40} defaultValue={job.coupon ?? ""} className={field} />
        </label>
        <label className={label + " sm:col-span-2"}>
          Promo
          <input name="promo" maxLength={200} defaultValue={job.promo ?? ""} className={field} />
        </label>
      </div>
      <Buttons pending={pending} onCancel={() => setOpen(false)} state={state} />
    </form>
  );
}

/** Times, place and stations of one photo day. The date moves through Change date. */
export function DayEditor({ jobId, day }: { jobId: string; day: Day }) {
  const { open, setOpen, state, action, pending } = useEditor(savePhotoDay.bind(null, jobId, day.id));
  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className={editLink + " mt-2"}>Edit times and place</button>;
  }
  return (
    <form action={action} className="mt-3 rounded-lg border border-line p-3">
      <div className={grid}>
        <label className={label}>
          Start
          <input name="start_time" type="time" step={300} defaultValue={day.start_time?.slice(0, 5) ?? ""} className={field} />
        </label>
        <label className={label}>
          End
          <input name="end_time" type="time" step={300} defaultValue={day.end_time?.slice(0, 5) ?? ""} className={field} />
        </label>
        <label className={label}>
          Label (optional)
          <input name="label" maxLength={120} defaultValue={day.label ?? ""} placeholder="Night 2, Travel teams, Rain date" className={field} />
        </label>
        <label className={label}>
          Stations
          <input name="stations" type="number" min={1} max={20} inputMode="numeric" required defaultValue={day.stations} className={field} />
        </label>
        <label className={label + " sm:col-span-2"}>
          Location
          <input name="location_name" maxLength={200} defaultValue={day.location_name ?? ""} className={field} />
        </label>
        <label className={label + " sm:col-span-2"}>
          Address
          <input name="address" maxLength={200} defaultValue={day.address ?? ""} className={field} />
        </label>
        <label className={label}>
          City
          <input name="city" maxLength={100} defaultValue={day.city ?? ""} className={field} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            State
            <input name="state" maxLength={40} defaultValue={day.state ?? ""} className={field} />
          </label>
          <label className={label}>
            ZIP
            <input name="zip" maxLength={10} inputMode="numeric" defaultValue={day.zip ?? ""} className={field} />
          </label>
        </div>
        <label className={label}>
          Indoor or outdoor
          <select key={String(day.indoor == null ? "" : day.indoor ? "indoor" : "outdoor")} name="indoor" defaultValue={day.indoor == null ? "" : day.indoor ? "indoor" : "outdoor"} className={field}>
            <option value="">Unknown</option>
            <option value="indoor">Indoor</option>
            <option value="outdoor">Outdoor</option>
          </select>
        </label>
        <label className={label}>
          Rain plan (indoor backup)
          <input name="alt_indoor_location" maxLength={200} defaultValue={day.alt_indoor_location ?? ""} className={field} />
        </label>
        <label className={label + " sm:col-span-2"}>
          Where to set up, parking, which field or gym
          <textarea name="location_details" rows={2} maxLength={1000} defaultValue={day.location_details ?? ""} className={field} />
        </label>
        <label className={label + " sm:col-span-2"}>
          Notes for this day
          <textarea name="notes" rows={2} maxLength={2000} defaultValue={day.notes ?? ""} className={field} />
        </label>
      </div>
      <p className="mt-2 text-xs text-muted">To move, postpone or cancel the day itself, use Change date.</p>
      <Buttons pending={pending} onCancel={() => setOpen(false)} state={state} />
    </form>
  );
}

export function LinksEditor({
  jobId,
  links,
  children,
}: {
  jobId: string;
  links: { captura_gallery_id: number | null; online_shop_url: string | null; drive_folder_url: string | null } | null;
  children: ReactNode;
}) {
  const { open, setOpen, state, action, pending } = useEditor(saveJobLinks.bind(null, jobId));
  if (!open) {
    return (
      <>
        {children}
        <button type="button" onClick={() => setOpen(true)} className={editLink + " mt-3"}>Edit links</button>
      </>
    );
  }
  return (
    <form action={action} className="grid grid-cols-1 gap-3">
      <label className={label}>
        Captura gallery number
        <input name="captura_gallery_id" inputMode="numeric" maxLength={12} defaultValue={links?.captura_gallery_id ?? ""} className={field} />
      </label>
      <label className={label}>
        Online shop link
        <input name="online_shop_url" type="url" maxLength={500} defaultValue={links?.online_shop_url ?? ""} placeholder="https://" className={field} />
      </label>
      <label className={label}>
        Drive folder link
        <input name="drive_folder_url" type="url" maxLength={500} defaultValue={links?.drive_folder_url ?? ""} placeholder="https://" className={field} />
      </label>
      <Buttons pending={pending} onCancel={() => setOpen(false)} state={state} />
    </form>
  );
}
