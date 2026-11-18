// The company settings an owner or admin may change from the Settings page.
// Everything else on that page stays read-only (test mode, the daily clock,
// sign-in domains): those are switched on deliberately, not by a form.

export type EditableSetting = { key: string; label: string; hint: string; min: number; max: number; unit: string };

export const EDITABLE_SETTINGS: { group: string; items: EditableSetting[] }[] = [
  {
    group: "Dates and holds",
    items: [
      { key: "capacity.stations_per_date", label: "Stations per date", hint: "How many photo stations can be out on one date.", min: 1, max: 50, unit: "stations" },
      { key: "holds.days_top_tier", label: "Hold length, top tier", hint: "Days a held date waits for a top-tier league.", min: 1, max: 90, unit: "days" },
      { key: "holds.days_other", label: "Hold length, others", hint: "Days a held date waits for every other league.", min: 1, max: 90, unit: "days" },
      { key: "holds.reminder_days", label: "Hold reminder", hint: "Days before a hold lapses that the league is reminded.", min: 1, max: 30, unit: "days" },
      { key: "photo_day.min_players", label: "Minimum photo day size", hint: "Smaller photo days are flagged on the season board.", min: 0, max: 1000, unit: "players" },
    ],
  },
  {
    group: "Chasing the form, roster and schedule",
    items: [
      { key: "chase.weeks_request", label: "First request", hint: "Weeks before photo day.", min: 1, max: 26, unit: "weeks" },
      { key: "chase.weeks_reminder", label: "Reminder", hint: "Weeks before photo day.", min: 1, max: 26, unit: "weeks" },
      { key: "chase.weeks_due_soon", label: "Due in one week note", hint: "Weeks before photo day.", min: 1, max: 26, unit: "weeks" },
      { key: "chase.weeks_due", label: "Due date", hint: "Weeks before photo day that items are asked for.", min: 1, max: 26, unit: "weeks" },
      { key: "chase.weeks_at_risk", label: "Date at risk note", hint: "Weeks before photo day.", min: 1, max: 26, unit: "weeks" },
      { key: "chase.deadline_days", label: "Final deadline", hint: "Days before photo day. Matches the agreement text.", min: 1, max: 60, unit: "days" },
    ],
  },
  {
    group: "Agreement",
    items: [
      { key: "agreement.facility_fee_cap_usd", label: "Facility fee cap", hint: "The most SNAP covers per location. Matches the agreement text.", min: 0, max: 5000, unit: "dollars" },
    ],
  },
  {
    group: "Ask SNAP",
    items: [
      { key: "agent.daily_budget_usd", label: "Daily spending cap", hint: "Once a day's questions have cost this much, Ask SNAP waits until tomorrow. 0 turns it off.", min: 0, max: 100, unit: "dollars a day" },
    ],
  },
];

export const EDITABLE_KEYS = new Map(EDITABLE_SETTINGS.flatMap((g) => g.items).map((s) => [s.key, s]));

/** The chase steps must stay in order, or a league would be told "due soon" before being asked. */
export function chaseOrderProblem(v: Record<string, number>): string | null {
  const order = ["chase.weeks_request", "chase.weeks_reminder", "chase.weeks_due_soon", "chase.weeks_due"];
  for (let i = 1; i < order.length; i++) {
    const a = v[order[i - 1]];
    const b = v[order[i]];
    if (a !== undefined && b !== undefined && b > a) {
      return `${EDITABLE_KEYS.get(order[i])!.label} cannot come before ${EDITABLE_KEYS.get(order[i - 1])!.label}.`;
    }
  }
  const due = v["chase.weeks_due"];
  const deadline = v["chase.deadline_days"];
  if (due !== undefined && deadline !== undefined && deadline > due * 7) return "The final deadline cannot come before the due date.";
  return null;
}
