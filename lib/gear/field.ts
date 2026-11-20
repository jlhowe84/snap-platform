// Shapes and small helpers for the gear pages and the field view. No database.

export const KIT_STATUS_LABEL: Record<string, string> = { ready: "Ready", needs_service: "Needs service", retired: "Retired" };
export const CHECKOUT_LABEL: Record<string, string> = { planned: "Planned", out: "Out", back: "Back" };

export type FieldView = {
  staff: boolean;
  day: {
    id: string;
    date: string;
    status: string;
    start_time: string | null;
    end_time: string | null;
    label: string | null;
    location_name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    location_details: string | null;
    indoor: boolean | null;
    alt_indoor_location: string | null;
    notes: string | null;
    stations: number;
  };
  job: {
    id: string;
    name: string;
    sports: string[];
    team_photo_type: string | null;
    expected_teams: number | null;
    expected_subjects: number | null;
    notes: string | null;
  };
  crew: { name: string; position: string; station: number | null; start_time: string | null; end_time: string | null; me: boolean; phone: string | null }[];
  kits: { code: string; station: number | null; status: string; cameras: string[] }[];
  contacts: { name: string; role: string; phone: string | null; email: string | null }[];
  schedule: { station: number; starts_at: string; minutes: number; kind: string; label: string | null; players: number | null }[];
  checklist: { section: string; name: string; outdoor_only: boolean }[];
};

/** The address as one line, and a map link when there is something to search for. */
export function placeOf(day: Pick<FieldView["day"], "location_name" | "address" | "city" | "state" | "zip">) {
  const line = [day.location_name, day.address, [day.city, day.state].filter(Boolean).join(", "), day.zip].filter(Boolean).join(", ");
  const query = [day.address || day.location_name, day.city, day.state, day.zip].filter(Boolean).join(", ");
  return { line, mapUrl: day.address || day.location_name ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null };
}

/** Items grouped by section, keeping their order. */
export function bySection<T extends { section: string }>(items: T[]): [string, T[]][] {
  const out = new Map<string, T[]>();
  for (const i of items) out.set(i.section, [...(out.get(i.section) ?? []), i]);
  return [...out.entries()];
}

/** A tel: link with only the digits and a leading plus. */
export function telHref(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 7 ? `tel:${digits}` : null;
}
