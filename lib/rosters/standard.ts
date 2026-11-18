// The finished SNAP roster file ("SNAP Roster _ Schedule for <Org> - Roster.csv").
// Rosters are normalized outside the platform; this reads that one known
// format and nothing else. It is strict on purpose: a file that breaks a rule
// is refused with the line that broke it, never guessed at.
//
// Pure: no storage, no database. Only team facts and head counts come out;
// no child's name leaves this module.

export const STANDARD_HEADER = [
  "Reference Number", "Homeroom", "Group", "Teacher", "First Name", "Last Name", "Email", "Email 2", "Email 3",
  "Organization", "Jersey Number", "Year", "Type", "Grade", "Street", "City", "State", "Zip", "Phone 1", "Phone 2",
  "Mother", "Father", "Custom Data 1", "Custom Data 2", "Custom Data 3", "Custom Data 4", "Custom Data 5",
  "Custom Data 6", "Custom Data 7",
] as const;

export const STANDARD_MAX_BYTES = 5 * 1024 * 1024;
export const STANDARD_MAX_ROWS = 20000;
const MAX_PROBLEMS = 25;

/** Groups that hold players nobody has placed on a team yet. They are not teams. */
const PLACEHOLDER = /NEEDS TEAM ASSIGNMENT|Unassigned/i;
const PHONE = /^\d{3}-\d{3}-\d{4}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const EXTRA_BLANK = ["Email", "Email 2", "Email 3", "Phone 1", "Phone 2", "Mother", "Father"] as const;

export type StandardTeam = {
  /** The Group value: the unique team label parents pick in the prepay store. */
  group: string;
  name: string;
  division: string | null;
  coach: string | null;
  sponsor: string | null;
  players: number;
};

export type StandardRoster =
  | {
      ok: true;
      organization: string;
      year: string;
      teams: StandardTeam[];
      players: number;
      coaches: number;
      extras: number;
      /** Players in a placeholder group, still waiting for a team. */
      unassigned: number;
    }
  | { ok: false; problems: string[] };

/** RFC 4180, commas only. Returns null when a quote is never closed. */
export function parseStandardCsv(input: string): string[][] | null {
  const src = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (quoted) return null;
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // Blank lines (often one at the end) carry nothing.
  return rows.filter((r) => r.some((c) => c !== ""));
}

/**
 * The short name the schedule shows. Group is "Division - Team - Coach" in
 * its fullest form, so the division in front and the coach behind are taken
 * off only when they match the row's own Homeroom and Teacher exactly.
 */
function shortName(group: string, division: string, coach: string) {
  let name = group;
  if (division && name.startsWith(`${division} - `)) name = name.slice(division.length + 3);
  const last = coach.replace(/^Coach\s+/i, "");
  for (const tail of [coach, last]) {
    if (tail && name.endsWith(` - ${tail}`)) {
      name = name.slice(0, -(tail.length + 3));
      break;
    }
  }
  return name.trim();
}

export function readStandardRoster(input: string): StandardRoster {
  const table = parseStandardCsv(input);
  if (!table) return { ok: false, problems: ["The file has a quote that is never closed, so it cannot be read as a CSV."] };
  if (!table.length) return { ok: false, problems: ["The file is empty."] };

  const header = table[0];
  if (header.length !== STANDARD_HEADER.length || header.some((h, i) => h !== STANDARD_HEADER[i])) {
    const at = STANDARD_HEADER.findIndex((h, i) => header[i] !== h);
    return {
      ok: false,
      problems: [
        at >= 0
          ? `The header row does not match the SNAP roster format. Column ${at + 1} should be "${STANDARD_HEADER[at]}" and is "${header[at] ?? "missing"}".`
          : `The header row has ${header.length} columns. The SNAP roster format has ${STANDARD_HEADER.length}.`,
      ],
    };
  }
  const body = table.slice(1);
  if (!body.length) return { ok: false, problems: ["The file has a header and no rows."] };
  if (body.length > STANDARD_MAX_ROWS) return { ok: false, problems: [`The file has more than ${STANDARD_MAX_ROWS} rows.`] };

  const problems: string[] = [];
  let more = 0;
  const problem = (p: string) => (problems.length < MAX_PROBLEMS ? problems.push(p) : more++);

  type Group = { division: string; coach: string; sponsor: string; players: number; extras: string[]; line: number };
  const groups = new Map<string, Group>();
  const orgs = new Set<string>();
  const years = new Set<string>();
  let players = 0;
  let coaches = 0;
  let extras = 0;
  let unassigned = 0;

  body.forEach((cells, i) => {
    const line = i + 2;
    if (cells.length !== STANDARD_HEADER.length) {
      problem(`Line ${line}: has ${cells.length} columns, expected ${STANDARD_HEADER.length}.`);
      return;
    }
    const r = Object.fromEntries(STANDARD_HEADER.map((h, c) => [h, cells[c]])) as Record<(typeof STANDARD_HEADER)[number], string>;

    if (r["Reference Number"] !== String(i + 1)) {
      problem(`Line ${line}: Reference Number is "${r["Reference Number"]}", expected ${i + 1} (they run 1, 2, 3 with no gaps).`);
    }
    orgs.add(r.Organization);
    years.add(r.Year);
    if (!r.Group.trim()) problem(`Line ${line}: Group is empty.`);
    if (r["Custom Data 3"] !== r.Group) problem(`Line ${line}: Custom Data 3 does not match Group.`);
    if (r.Type !== "Player" && r.Type !== "Coach") problem(`Line ${line}: Type is "${r.Type}", expected Player or Coach.`);
    else if (/coach/i.test(r["First Name"]) !== (r.Type === "Coach")) {
      problem(`Line ${line}: Type is ${r.Type}, which does not fit the First Name on that row.`);
    }
    for (const col of ["Phone 1", "Phone 2"] as const) {
      if (r[col] && !PHONE.test(r[col])) problem(`Line ${line}: ${col} is not in the form XXX-XXX-XXXX.`);
    }
    for (const col of ["Email", "Email 2", "Email 3"] as const) {
      if (r[col] && !EMAIL.test(r[col])) problem(`Line ${line}: ${col} does not look like an email address.`);
    }

    let g = groups.get(r.Group);
    if (!g) {
      g = { division: r.Homeroom.trim(), coach: r.Teacher.trim(), sponsor: "", players: 0, extras: [], line };
      groups.set(r.Group, g);
    } else if (g.division !== r.Homeroom.trim()) {
      problem(`Line ${line}: Homeroom differs from the other rows of group "${r.Group}".`);
    }
    if (!g.coach && r.Teacher.trim()) g.coach = r.Teacher.trim();
    if (!g.sponsor && r["Custom Data 6"].trim()) g.sponsor = r["Custom Data 6"].trim();

    const isExtra = r["First Name"].trim() === "Extra Player";
    if (isExtra) {
      extras++;
      g.extras.push(r["Last Name"]);
      if (EXTRA_BLANK.some((c) => r[c])) problem(`Line ${line}: an Extra Player row has contact details.`);
    } else if (r.Type === "Coach") coaches++;
    else if (r.Type === "Player") {
      players++;
      g.players++;
      if (PLACEHOLDER.test(r.Group)) unassigned++;
    }
  });

  if (orgs.size !== 1) problem("Organization is not the same on every row.");
  if (years.size !== 1) problem("Year is not the same on every row.");

  // Every real team carries the same number of Extra Player rows, numbered 1..N.
  const real = [...groups].filter(([name]) => !PLACEHOLDER.test(name));
  const extraCount = real.length ? real[0][1].extras.length : 0;
  for (const [name, g] of groups) {
    const want = PLACEHOLDER.test(name) ? 0 : extraCount;
    if (g.extras.length !== want) {
      problem(`Group "${name}": ${g.extras.length} Extra Player rows, expected ${want}.`);
    } else if ([...g.extras].sort((a, b) => Number(a) - Number(b)).some((v, k) => v !== String(k + 1))) {
      problem(`Group "${name}": Extra Player rows are not numbered 1 to ${g.extras.length} in Last Name.`);
    }
  }

  if (problems.length) {
    if (more) problems.push(`And ${more} more.`);
    return { ok: false, problems };
  }

  const teams: StandardTeam[] = real.map(([group, g]) => ({
    group,
    name: shortName(group, g.division, g.coach) || group,
    division: g.division || null,
    coach: g.coach || null,
    sponsor: g.sponsor || null,
    players: g.players,
  }));
  // The short name must still tell teams apart inside a division; where it
  // does not, those teams keep the full group label.
  const key = (t: StandardTeam) => `${t.division ?? ""}\u0000${t.name.toLowerCase()}`;
  const seen = new Map<string, number>();
  for (const t of teams) seen.set(key(t), (seen.get(key(t)) ?? 0) + 1);
  for (const t of teams) if ((seen.get(key(t)) ?? 0) > 1) t.name = t.group;

  return {
    ok: true,
    organization: [...orgs][0],
    year: [...years][0],
    teams,
    players,
    coaches,
    extras,
    unassigned,
  };
}
