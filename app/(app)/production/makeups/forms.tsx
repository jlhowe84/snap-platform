"use client";

import { useActionState, useRef } from "react";
import { useToast } from "@/components/toast";
import { BOOKING_STATUSES, BOOKING_STATUS_LABEL, FOLLOW_UP, type BookingStatus, type FollowUpKey } from "@/lib/makeups/schedule";
import { ConfirmButton } from "@/components/confirm-button";
import { addBooking, cancelBooking, findOnlineCode, moveBooking, saveBooking, type MakeupState } from "./actions";

const field = "min-h-12 w-full min-w-0 rounded-lg border border-line bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none sm:min-h-0";
const label = "block text-xs font-medium text-muted";
const primary = "min-h-12 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60 sm:min-h-0";
const quiet = "min-h-12 rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:border-accent hover:text-accent disabled:opacity-60 sm:min-h-0";

export type BookingEdit = {
  id: string;
  status: BookingStatus;
  league: string | null;
  team: string | null;
  order_number: number | null;
  online_code: string | null;
  staff_note: string | null;
} & Record<FollowUpKey, boolean>;

/** One booking's status, slip details, note and follow-up boxes, saved together. */
export function BookingForm({ booking, canFind }: { booking: BookingEdit; canFind: boolean }) {
  const [state, action, pending] = useActionState<MakeupState, FormData>(saveBooking.bind(null, booking.id), null);
  const [found, find, finding] = useActionState<MakeupState>(() => findOnlineCode(booking.id), null);
  useToast(state);
  useToast(found);
  return (
    <div className="mt-3 space-y-3">
      <form action={action} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className={label}>
            Status
            <select key={String(booking.status)} name="status" defaultValue={booking.status} className={field}>
              {BOOKING_STATUSES.map((s) => <option key={s} value={s}>{BOOKING_STATUS_LABEL[s]}</option>)}
            </select>
          </label>
          <label className={label}>
            League
            <input name="league" maxLength={160} defaultValue={booking.league ?? ""} className={field} />
          </label>
          <label className={label}>
            Team
            <input name="team" maxLength={160} defaultValue={booking.team ?? ""} className={field} />
          </label>
          <label className={label}>
            Order number
            <input name="order_number" inputMode="numeric" maxLength={12} defaultValue={booking.order_number ?? ""} className={field} />
          </label>
          <label className={label}>
            Online code
            <input key={booking.online_code ?? ""} name="online_code" maxLength={40} defaultValue={booking.online_code ?? ""} className={field + " font-mono"} />
          </label>
        </div>
        <label className={label}>
          Notes
          <textarea name="staff_note" rows={2} maxLength={2000} defaultValue={booking.staff_note ?? ""} className={field} />
        </label>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {FOLLOW_UP.map((f) => (
            <label key={f.key} className="flex min-h-12 items-center gap-2 text-sm sm:min-h-8">
              <input type="checkbox" name={f.key} defaultChecked={booking[f.key]} className="h-5 w-5 accent-[var(--accent)]" />
              {f.label}
            </label>
          ))}
        </div>
        <button disabled={pending} className={primary}>{pending ? "Saving…" : "Save"}</button>
      </form>
      {canFind && !booking.online_code && (
        <form action={find} className="flex flex-wrap items-center gap-3">
          <button disabled={finding} className={quiet}>{finding ? "Asking Captura…" : "Find the online code in Captura"}</button>
          {found && !found.ok && <p className="text-sm text-risk">{found.message}</p>}
        </form>
      )}
    </div>
  );
}

/** Move a booked session to another date or time, or cancel it. */
export function MoveOrCancel({ id, date, time, hasEmail }: { id: string; date: string; time: string; hasEmail: boolean }) {
  const [moved, move, moving] = useActionState<MakeupState, FormData>(moveBooking.bind(null, id), null);
  const [cancelled, cancel] = useActionState<MakeupState, FormData>(cancelBooking.bind(null, id), null);
  useToast(moved);
  useToast(cancelled);
  // One form, read top to bottom: pick a new time and move it, or cancel below.
  return (
    <form action={move} className="mt-3 max-w-2xl rounded-lg border border-line p-3">
      <p className="text-sm font-semibold">Move to a new time</p>
      <div className="mt-2 grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <label className={label}>
          New date
          <input name="date" type="date" required defaultValue={date} className={field} />
        </label>
        <label className={label}>
          New time
          <input name="time" type="time" required step={300} defaultValue={time} className={field} />
        </label>
        <button disabled={moving} className={primary}>{moving ? "Moving…" : "Move"}</button>
      </div>
      {moved && !moved.ok && <p className="mt-2 text-sm text-risk">{moved.message}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line pt-3">
        <p className="text-sm">
          <span className="font-semibold">Or cancel it.</span> <span className="text-muted">The time opens up for someone else.</span>
        </p>
        <ConfirmButton
          formAction={cancel}
          formNoValidate
          ask="Cancel this session?"
          yes="Yes, cancel it"
          className={quiet + " border-risk/50 text-risk hover:border-risk"}
        >
          Cancel the session
        </ConfirmButton>
      </div>
      {cancelled && !cancelled.ok && <p className="mt-2 text-sm text-risk">{cancelled.message}</p>}
      <label className="mt-2 flex min-h-12 items-center gap-2 border-t border-line pt-2 text-sm sm:min-h-8">
        <input type="checkbox" name="tell" defaultChecked={hasEmail} disabled={!hasEmail} className="h-5 w-5 accent-[var(--accent)]" />
        {hasEmail ? "Email the parent about the move or the cancellation" : "No email on file to tell the parent"}
      </label>
    </form>
  );
}

/** The office books a time for a parent who called or wrote in. */
export function AddBooking({ date }: { date: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<MakeupState, FormData>(async (prev, form) => {
    const result = await addBooking(prev, form);
    if (result?.ok) ref.current?.reset();
    return result;
  }, null);
  useToast(state);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className={label}>
          Date
          <input name="date" type="date" required defaultValue={date} className={field} />
        </label>
        <label className={label}>
          Time
          <input name="time" type="time" required step={300} className={field} />
        </label>
        <label className={label}>
          Kind
          <select name="kind" defaultValue="makeup" className={field}>
            <option value="makeup">Makeup</option>
            <option value="retake">Retake</option>
          </select>
        </label>
        <label className={label}>
          Player
          <input name="player" required maxLength={120} className={field} />
        </label>
        <label className={label}>
          League
          <input name="league" maxLength={160} className={field} />
        </label>
        <label className={label}>
          Team
          <input name="team" maxLength={160} className={field} />
        </label>
        <label className={label}>
          Order number
          <input name="order_number" inputMode="numeric" maxLength={12} className={field} />
        </label>
        <label className={label}>
          Parent
          <input name="parent_name" maxLength={120} className={field} />
        </label>
        <label className={label}>
          Email
          <input name="email" type="email" maxLength={254} className={field} />
        </label>
        <label className={label}>
          Phone
          <input name="phone" type="tel" maxLength={40} className={field} />
        </label>
        <label className={label + " sm:col-span-2"}>
          Note
          <input name="note" maxLength={1000} className={field} />
        </label>
      </div>
      <label className="flex min-h-12 items-center gap-2 text-sm sm:min-h-8">
        <input type="checkbox" name="confirm" defaultChecked className="h-5 w-5 accent-[var(--accent)]" />
        Email the parent a confirmation with a cancel link
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className={primary}>{pending ? "Booking…" : "Book it"}</button>
        {state && !state.ok && <p className="text-sm text-risk">{state.message}</p>}
      </div>
    </form>
  );
}
