"use client";

import { useActionState } from "react";
import { useToast } from "@/components/toast";
import { saveMyDetails, type DetailsState } from "../actions";

export type MyDetails = {
  phone: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
};

const field = "min-h-12 w-full rounded-lg border border-line bg-bg px-3 py-2 text-base text-text focus:border-accent focus:outline-none";
const label = "mb-1 block text-xs font-semibold uppercase tracking-wider text-muted";

export function DetailsForm({ current }: { current: MyDetails }) {
  const [state, action, saving] = useActionState<DetailsState, FormData>(saveMyDetails, null);
  useToast(state);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className={label} htmlFor="phone">Mobile phone</label>
        <input id="phone" name="phone" type="tel" autoComplete="tel" maxLength={40} defaultValue={current.phone ?? ""} className={field} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
        <div>
          <label className={label} htmlFor="city">Town</label>
          <input id="city" name="city" autoComplete="address-level2" maxLength={80} defaultValue={current.city ?? ""} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="state">State</label>
          <input id="state" name="state" autoComplete="address-level1" maxLength={40} defaultValue={current.state ?? ""} className={field} />
        </div>
      </div>
      <div>
        <label className={label} htmlFor="address">Home address</label>
        <input id="address" name="address" autoComplete="street-address" maxLength={300} defaultValue={current.address ?? ""} placeholder="Street, town, state and ZIP" className={field} />
        <p className="mt-1 text-xs text-muted">Used to work out your mileage. Only the owner and admin can see it.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="emergency_name">Emergency contact</label>
          <input id="emergency_name" name="emergency_name" maxLength={120} defaultValue={current.emergency_name ?? ""} placeholder="Name" className={field} />
        </div>
        <div>
          <label className={label} htmlFor="emergency_phone">Their phone</label>
          <input id="emergency_phone" name="emergency_phone" type="tel" maxLength={40} defaultValue={current.emergency_phone ?? ""} className={field} />
        </div>
      </div>
      <button disabled={saving} className="min-h-12 w-full rounded-lg bg-accent px-4 py-3 text-base font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60 sm:w-auto">
        {saving ? "Saving…" : "Save my details"}
      </button>
      {state && <p role="status" className={state.ok ? "text-sm text-muted" : "text-sm text-risk"}>{state.message}</p>}
    </form>
  );
}
