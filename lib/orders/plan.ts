// The order sync's plan: settings, paging and the history walk. Pure, so it
// can be tested without Captura or a database.

export const PAGE = 100;
export const HISTORY_STEP_DAYS = 7;
const DEFAULT_RECENT_DAYS = 3;

export type SyncCounts = { orders: number; adjustments: number; skipped: number; pages: number; galleries: number };

export const ORDER_SETTING_KEYS = ["orders.sync_enabled", "orders.history_from", "orders.recent_days"];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function orderSettings(rows: { key: string; value: unknown }[]) {
  const get = (key: string) => rows.find((r) => r.key === key)?.value;
  const from = get("orders.history_from");
  const recent = get("orders.recent_days");
  return {
    // Off unless an owner or admin turns it on; a person can still check by hand.
    enabled: get("orders.sync_enabled") === true,
    historyFrom: typeof from === "string" && ISO.test(from) ? from : null,
    recentDays: typeof recent === "number" && recent >= 1 && recent <= 14 ? Math.floor(recent) : DEFAULT_RECENT_DAYS,
  };
}

/** A calendar day moved by n days. */
export function shiftDay(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The next stretch of history to read: a week from `from`, stopping the day
 * before the recent days the run reads anyway. Null once the history is in.
 */
export function historyWindow(from: string, recentFrom: string): { from: string; to: string; next: string } | null {
  if (from >= recentFrom) return null;
  const end = shiftDay(from, HISTORY_STEP_DAYS - 1);
  const to = end < recentFrom ? end : shiftDay(recentFrom, -1);
  return { from, to, next: shiftDay(to, 1) };
}
