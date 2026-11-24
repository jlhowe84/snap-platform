import { describe, expect, it } from "vitest";
import { buildSupportReport, formatHours, median, reportPeriod, responseHours, type ReportConversation } from "@/lib/support/report";

const now = new Date("2026-11-24T18:00:00Z");
const conv = (over: Partial<ReportConversation>): ReportConversation => ({
  status: "open", category: null, first_message_at: null, first_response_at: null, closed_at: null, closed_by: null, ...over,
});

describe("support report helpers", () => {
  it("finds the middle value", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 2])).toBe(3);
  });
  it("measures the first reply and ignores a clock that runs backward", () => {
    expect(responseHours({ first_message_at: "2026-11-20T10:00:00Z", first_response_at: "2026-11-20T13:30:00Z" })).toBe(3.5);
    expect(responseHours({ first_message_at: "2026-11-20T10:00:00Z", first_response_at: null })).toBeNull();
    expect(responseHours({ first_message_at: "2026-11-20T10:00:00Z", first_response_at: "2026-11-20T09:00:00Z" })).toBeNull();
  });
  it("words a length of time", () => {
    expect(formatHours(null)).toBe("No replies yet");
    expect(formatHours(0.4)).toBe("Under an hour");
    expect(formatHours(1.2)).toBe("1 hour");
    expect(formatHours(5)).toBe("5 hours");
    expect(formatHours(24)).toBe("1 day");
    expect(formatHours(60)).toBe("2.5 days");
  });
  it("falls back to 30 days for an unknown period", () => {
    expect(reportPeriod("90")).toBe(90);
    expect(reportPeriod("12")).toBe(30);
    expect(reportPeriod(undefined)).toBe(30);
  });
});

describe("buildSupportReport", () => {
  const rows = [
    conv({ first_message_at: "2026-11-23T15:00:00Z", first_response_at: "2026-11-23T17:00:00Z", category: "Order", status: "waiting_customer" }),
    conv({ first_message_at: "2026-11-22T15:00:00Z", first_response_at: "2026-11-24T15:00:00Z", category: "Order", status: "closed", closed_at: "2026-11-24T16:00:00Z", closed_by: "p1" }),
    conv({ first_message_at: "2026-11-24T12:00:00Z", status: "new" }),
    // Started long ago, closed this week: counts as closed, not as started.
    conv({ first_message_at: "2026-09-01T12:00:00Z", first_response_at: "2026-09-01T13:00:00Z", status: "closed", closed_at: "2026-11-23T12:00:00Z", closed_by: "p1" }),
  ];
  const r = buildSupportReport(rows, [{ author_id: "p1" }, { author_id: "p2" }, { author_id: "p1" }, { author_id: null }], {
    days: 7, timeZone: "America/New_York", now,
  });

  it("counts what started, was answered, waits and was closed", () => {
    expect(r.started).toBe(3);
    expect(r.answered).toBe(2);
    expect(r.waiting).toBe(1);
    expect(r.closed).toBe(2);
    expect(r.medianHours).toBe(25);
    expect(r.withinDay).toBe(0.5);
  });
  it("gives a bar per day in the company time zone, today last", () => {
    expect(r.buckets.at(-1)).toMatchObject({ key: "2026-11-24", started: 1 });
    expect(r.buckets.find((b) => b.key === "2026-11-23")?.started).toBe(1);
    expect(r.buckets.reduce((n, b) => n + b.started, 0)).toBe(3);
  });
  it("groups by category and by person", () => {
    expect(r.categories).toEqual([
      { name: "Order", started: 2, answered: 2, medianHours: 25 },
      { name: "No category", started: 1, answered: 0, medianHours: null },
    ]);
    expect(r.people).toEqual([{ id: "p1", replies: 2, closed: 2 }, { id: "p2", replies: 1, closed: 0 }]);
  });
  it("uses weeks starting on Monday for longer periods", () => {
    const long = buildSupportReport(rows, [], { days: 90, timeZone: "America/New_York", now });
    expect(long.started).toBe(4);
    expect(long.buckets.at(-1)).toMatchObject({ key: "2026-11-23", started: 2 });
    expect(long.buckets.reduce((n, b) => n + b.started, 0)).toBe(4);
  });
});
