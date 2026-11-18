import { describe, expect, it } from "vitest";
import { parseStandardCsv, readStandardRoster, STANDARD_HEADER } from "@/lib/rosters/standard";

type Row = Partial<Record<(typeof STANDARD_HEADER)[number], string>>;

const quote = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Builds a file the way the roster process writes one: numbered rows, Custom Data 3 copied from Group. */
function file(rows: Row[], header: readonly string[] = STANDARD_HEADER) {
  const lines = rows.map((r, i) => {
    const full: Row = { "Reference Number": String(i + 1), Organization: "Test League", Year: "2027", Type: "Player", "Custom Data 3": r.Group ?? "", ...r };
    return STANDARD_HEADER.map((h) => quote(full[h] ?? "")).join(",");
  });
  return [header.join(","), ...lines].join("\r\n") + "\r\n";
}

const player = (group: string, division: string, coach: string, first: string, more: Row = {}): Row => ({
  Group: group, Homeroom: division, Teacher: coach, "First Name": first, "Last Name": "Sample", ...more,
});
const coachRow = (group: string, division: string, coach: string): Row => ({
  Group: group, Homeroom: division, Teacher: coach, "First Name": "Head Coach Pat", "Last Name": "Sample", Type: "Coach",
});
const extras = (group: string, division: string, coach: string, n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ Group: group, Homeroom: division, Teacher: coach, "First Name": "Extra Player", "Last Name": String(i + 1) }));

function team(group: string, division: string, coach: string, players: number, more: Row = {}): Row[] {
  return [
    ...Array.from({ length: players }, (_, i) => player(group, division, coach, `Kid${i + 1}`, more)),
    coachRow(group, division, coach),
    ...extras(group, division, coach, 2),
  ];
}

describe("the finished SNAP roster file", () => {
  it("reads teams with player counts that leave out coaches and extra rows", () => {
    const r = readStandardRoster(file([
      ...team("U8 - Tigers - Smith", "U8", "Coach Smith", 3, { "Custom Data 6": "Pizza Place", Email: "Parent@Example.com", "Phone 1": "610-555-0100" }),
      ...team("U10 - Lions - Coach Lisa", "U10", "Coach Lisa", 2),
    ]));
    expect(r).toEqual({
      ok: true, organization: "Test League", year: "2027", players: 5, coaches: 2, extras: 4, unassigned: 0,
      teams: [
        { group: "U8 - Tigers - Smith", name: "Tigers", division: "U8", coach: "Coach Smith", sponsor: "Pizza Place", players: 3 },
        { group: "U10 - Lions - Coach Lisa", name: "Lions", division: "U10", coach: "Coach Lisa", sponsor: null, players: 2 },
      ],
    });
  });

  it("keeps the full group label when the short name would not tell teams apart", () => {
    const r = readStandardRoster(file([
      ...team("U8 - Tigers - Smith", "U8", "Coach Smith", 1),
      ...team("U8 - Tigers - Jones", "U8", "Coach Jones", 1),
      ...team("Marlins", "", "", 1),
    ]));
    expect(r.ok && r.teams.map((t) => [t.name, t.division])).toEqual([
      ["U8 - Tigers - Smith", "U8"], ["U8 - Tigers - Jones", "U8"], ["Marlins", null],
    ]);
  });

  it("counts unassigned players and makes no team of the placeholder group", () => {
    const r = readStandardRoster(file([
      ...team("U8 - Tigers - Smith", "U8", "Coach Smith", 2),
      player("NEEDS TEAM ASSIGNMENT", "U8", "", "Kid"),
    ]));
    expect(r.ok && [r.teams.length, r.players, r.unassigned]).toEqual([1, 3, 1]);
  });

  it("reads quoted cells and a leading byte order mark", () => {
    const text = "﻿" + file(team("U8 - Tigers, Blue - Smith", "U8", "Coach Smith", 1, { Mother: 'Ann "AJ" Sample' }));
    const r = readStandardRoster(text);
    expect(r.ok && r.teams[0].name).toBe("Tigers, Blue");
    expect(parseStandardCsv('a,"b ""c"", d"\n\n1,2\n')).toEqual([["a", 'b "c", d'], ["1", "2"]]);
    expect(parseStandardCsv('a,"b')).toBeNull();
  });

  it("refuses a file in any other shape, naming the column", () => {
    const r = readStandardRoster("First Name,Last Name,Team\nKid,Sample,Tigers\n");
    expect(r).toEqual({ ok: false, problems: [expect.stringContaining('Column 1 should be "Reference Number"')] });
    const swapped = [...STANDARD_HEADER];
    [swapped[1], swapped[2]] = [swapped[2], swapped[1]];
    const s = readStandardRoster(file(team("A", "", "", 1), swapped));
    expect(!s.ok && s.problems[0]).toContain('Column 2 should be "Homeroom"');
  });

  it("names the line that breaks a rule", () => {
    const rows = team("U8 - Tigers - Smith", "U8", "Coach Smith", 2);
    const bad = (change: (r: Row[]) => void) => {
      const copy = rows.map((r) => ({ ...r }));
      change(copy);
      const r = readStandardRoster(file(copy));
      return r.ok ? [] : r.problems;
    };
    expect(bad((r) => (r[1]["Reference Number"] = "7"))[0]).toContain("Line 3: Reference Number");
    expect(bad((r) => (r[0]["Custom Data 3"] = "Other"))[0]).toContain("Line 2: Custom Data 3");
    expect(bad((r) => (r[0].Type = "Coach"))[0]).toContain("Line 2: Type is Coach");
    expect(bad((r) => (r[0]["Phone 1"] = "(610) 555-0100"))[0]).toContain("Line 2: Phone 1");
    expect(bad((r) => (r[0].Email = "not an email"))[0]).toContain("Line 2: Email");
    expect(bad((r) => (r[1].Organization = "Another League"))[0]).toContain("Organization");
    expect(bad((r) => (r[4]["Last Name"] = "5"))[0]).toContain("numbered 1 to 2");
    expect(bad((r) => (r[4].Email = "a@b.co"))[0]).toContain("Extra Player row has contact details");
  });

  it("wants the same number of extra rows on every team, and none on a placeholder", () => {
    const uneven = readStandardRoster(file([
      ...team("A", "", "", 1),
      player("B", "", "", "Kid"),
    ]));
    expect(!uneven.ok && uneven.problems[0]).toContain('Group "B": 0 Extra Player rows, expected 2');
    const placeholder = readStandardRoster(file([...team("A", "", "", 1), ...extras("Unassigned", "", "", 2)]));
    expect(!placeholder.ok && placeholder.problems[0]).toContain('Group "Unassigned": 2 Extra Player rows, expected 0');
  });
});
