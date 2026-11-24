"use client";

import { useActionState, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { finishCrewPhoto, saveCrewDetails, savePrivate, startCrewPhoto, type PayState } from "../actions";
import { POSITION_LABEL } from "@/lib/staffing/plan";

const field = "mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm";
const label = "block text-xs font-semibold uppercase tracking-[0.14em] text-muted";
const primary = "rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60";

function Status({ state }: { state: PayState }) {
  if (!state) return null;
  return <p role="status" className={state.ok ? "text-sm text-muted" : "text-sm text-risk"}>{state.message}</p>;
}

export type CrewDetails = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  positions: string[];
  level: number | null;
  active: boolean;
  notes: string | null;
};

export function DetailsForm({ crew }: { crew: CrewDetails | null }) {
  const [state, action, pending] = useActionState<PayState, FormData>(saveCrewDetails.bind(null, crew?.id ?? null), null);
  useToast(state);
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={label}>
          Name
          <input name="full_name" required maxLength={120} defaultValue={crew?.full_name ?? ""} className={field} />
        </label>
        <label className={label}>
          Email (the one they sign in with)
          <input name="email" type="email" maxLength={200} defaultValue={crew?.email ?? ""} className={field} />
        </label>
        <label className={label}>
          Phone
          <input name="phone" type="tel" maxLength={40} defaultValue={crew?.phone ?? ""} className={field} />
        </label>
        <div className="grid grid-cols-[2fr_1fr] gap-3">
          <label className={label}>
            Town
            <input name="city" maxLength={80} defaultValue={crew?.city ?? ""} className={field} />
          </label>
          <label className={label}>
            State
            <input name="state" maxLength={40} defaultValue={crew?.state ?? ""} className={field} />
          </label>
        </div>
      </div>
      <fieldset>
        <legend className={label}>Positions</legend>
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          {Object.entries(POSITION_LABEL).map(([k, v]) => (
            <label key={k} className="flex items-center gap-2">
              <input type="checkbox" name="positions" value={k} defaultChecked={crew?.positions.includes(k) ?? false} />
              {v}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={label}>
          Level (1 is asked first)
          <select key={String(crew?.level == null ? "" : String(crew.level))} name="level" defaultValue={crew?.level == null ? "" : String(crew.level)} className={field}>
            <option value="">No Level</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>Level {n}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={crew?.active ?? true} />
          Active (gets shift offers)
        </label>
      </div>
      <label className={label}>
        Notes
        <textarea name="notes" rows={3} maxLength={4000} defaultValue={crew?.notes ?? ""} className={field} />
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pending} className={primary}>{pending ? "Saving…" : crew ? "Save details" : "Add crew member"}</button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function PrivateForm({
  crewId,
  current,
}: {
  crewId: string;
  current: { address: string | null; emergency_name: string | null; emergency_phone: string | null } | null;
}) {
  const [state, action, pending] = useActionState<PayState, FormData>(savePrivate.bind(null, crewId), null);
  useToast(state);
  return (
    <form action={action} className="space-y-3">
      <label className={label}>
        Home address (for mileage)
        <input name="address" maxLength={300} placeholder="Street, town, state" defaultValue={current?.address ?? ""} className={field} />
      </label>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={label}>
          Emergency contact
          <input name="emergency_name" maxLength={120} defaultValue={current?.emergency_name ?? ""} className={field} />
        </label>
        <label className={label}>
          Their phone
          <input name="emergency_phone" type="tel" maxLength={40} defaultValue={current?.emergency_phone ?? ""} className={field} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button disabled={pending} className={primary}>{pending ? "Saving…" : "Save"}</button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function PhotoUpload({ crewId, hasPhoto }: { crewId: string; hasPhoto: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; message: string } | null>(null);

  async function send(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const start = await startCrewPhoto(crewId, { type: file.type, size: file.size });
      if (!start.ok) {
        setMessage(start);
        return;
      }
      const { error } = await createClient().storage.from("crew-photos").uploadToSignedUrl(start.path, start.token, file, { contentType: file.type });
      if (error) {
        setMessage({ ok: false, message: "The upload was interrupted. Try again." });
        return;
      }
      setMessage(await finishCrewPhoto(crewId, start.path));
      router.refresh();
    } catch {
      setMessage({ ok: false, message: "The upload was interrupted. Try again." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <input ref={input} id={`photo-${crewId}`} type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="sr-only" onChange={(e) => void send(e.target.files?.[0])} />
      <label
        htmlFor={`photo-${crewId}`}
        className={`inline-block cursor-pointer rounded-lg border border-line px-3 py-1.5 text-sm hover:border-accent hover:text-accent ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        {busy ? "Uploading…" : hasPhoto ? "Change photo" : "Add a photo"}
      </label>
      {message && <p role="status" className={`mt-2 text-sm ${message.ok ? "text-muted" : "text-risk"}`}>{message.message}</p>}
    </div>
  );
}
