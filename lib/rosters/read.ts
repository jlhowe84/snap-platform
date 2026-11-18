// Reads roster rows into teams. Pure: no storage, no database, and it keeps
// no child's name. Only team, division, coach and a head count come out.

export type Cell = string | number | boolean | Date | null | undefined;
export type Table = { name: string; rows: Cell[][] };

export type RosterTeam = { name: string; division: string | null; coach: string | null; players: number };
export type RosterRead = {
  teams: RosterTeam[];
  players: number;
  /** What a person needs to look at, in plain words. Empty when the read is clean. */
  questions: string[];
};

export const MAX_ROWS = 20000;

const text = (c: Cell) => (c === null || c === undefined ? "" : c instanceof Date ? "" : String(c)).replace(/\s+/g, " ").trim();
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Header words, most specific first. A column is claimed by the first kind it matches.
const KINDS: [kind: "team" | "division" | "coach" | "first" | "last" | "player", re: RegExp][] = [
  ["coach", /\b(coach|manager)\b/],
  ["team", /\b(team|squad|group|club|roster name)\b/],
  ["division", /\b(division|div|age group|age division|grade|level|league|program)\b/],
  ["first", /\b(first|given)\b/],
  ["last", /\b(last|surname|family)\b/],
  ["player", /\b(player|athlete|participant|child|camper|student|swimmer|name)\b/],
];

// Parent and contact columns often say "first name" too; they are never read.
const NOT_A_PLAYER = /\b(parent|guardian|mother|father|mom|dad|emergency|contact|email|phone|address|billing)\b/;

type Columns = Partial<Record<(typeof KINDS)[number][0], number>>;

function findHeader(rows: Cell[][]): { at: number; cols: Columns } | null {
  for (let at = 0; at < Math.min(rows.length, 15); at++) {
    const cols: Columns = {};
    rows[at].forEach((c, i) => {
      const h = norm(text(c));
      if (!h || h.length > 40 || NOT_A_PLAYER.test(h)) return;
      const hit = KINDS.find(([kind, re]) => re.test(h) && cols[kind] === undefined);
      if (hit) cols[hit[0]] = i;
    });
    const hasPlayer = cols.player !== undefined || cols.first !== undefined || cols.last !== undefined;
    if (cols.team !== undefined || (hasPlayer && Object.keys(cols).length >= 2)) return { at, cols };
  }
  return null;
}

/** RFC 4180 CSV, with tabs or semicolons accepted when the first line uses them. */
export function parseCsv(input: string): Cell[][] {
  const src = input.replace(/^﻿/, "");
  const first = src.slice(0, src.search(/\r?\n|$/));
  const count = (ch: string) => first.split(ch).length;
  const sep = count("\t") > count(",") ? "\t" : count(";") > count(",") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (rows.length > MAX_ROWS) break;
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function readRoster(tables: Table[]): RosterRead {
  const questions: string[] = [];
  const teams = new Map<string, RosterTeam & { coaches: Map<string, number> }>();
  let players = 0;
  let noTeamRows = 0;
  const used = tables.filter((t) => t.rows.some((r) => r.some((c) => text(c) !== "")));
  if (!used.length) return { teams: [], players: 0, questions: ["The file is empty."] };

  for (const table of used) {
    const where = used.length > 1 ? ` on sheet "${table.name}"` : "";
    if (table.rows.length > MAX_ROWS) questions.push(`Only the first ${MAX_ROWS.toLocaleString("en-US")} rows${where} were read.`);
    const header = findHeader(table.rows);
    if (!header) {
      questions.push(`We could not find a header row${where}, so nothing was read from it.`);
      continue;
    }
    const { cols } = header;
    // One sheet per team is common: with no team column, the sheet name stands in.
    const sheetTeam = cols.team === undefined && used.length > 1 ? table.name.trim() : null;
    if (cols.team === undefined && !sheetTeam) {
      questions.push("We could not find a team column, so no teams were read. Check the file and add the teams by hand.");
      continue;
    }
    if (sheetTeam) questions.push(`Sheet "${table.name}" has no team column, so the sheet name was used as the team.`);
    const hasPlayer = cols.player !== undefined || cols.first !== undefined || cols.last !== undefined;

    for (const row of table.rows.slice(header.at + 1, MAX_ROWS)) {
      if (!row.some((c) => text(c) !== "")) continue;
      const person = [cols.first, cols.last, cols.player].map((i) => (i === undefined ? "" : text(row[i]))).join("");
      if (hasPlayer && !person) continue; // a spacer or a subtotal line
      const name = (sheetTeam ?? text(row[cols.team!])).slice(0, 120);
      if (!name) {
        noTeamRows++;
        continue;
      }
      const division = cols.division === undefined ? null : text(row[cols.division]).slice(0, 80) || null;
      const key = `${norm(name)}|${norm(division ?? "")}`;
      let team = teams.get(key);
      if (!team) teams.set(key, (team = { name, division, coach: null, players: 0, coaches: new Map() }));
      if (hasPlayer) {
        team.players++;
        players++;
      }
      const coach = cols.coach === undefined ? "" : text(row[cols.coach]).slice(0, 120);
      if (coach) team.coaches.set(coach, (team.coaches.get(coach) ?? 0) + 1);
    }
    if (!hasPlayer) questions.push(`There is no player name column${where}, so team sizes are not known.`);
  }

  const out: RosterTeam[] = [...teams.values()]
    .map(({ coaches, ...t }) => ({ ...t, coach: [...coaches.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null }))
    .sort((a, b) => (a.division ?? "").localeCompare(b.division ?? "") || a.name.localeCompare(b.name, undefined, { numeric: true }));

  if (noTeamRows) questions.push(`${noTeamRows} ${noTeamRows === 1 ? "player has" : "players have"} no team.`);
  const noCoach = out.filter((t) => !t.coach);
  if (out.length && noCoach.length === out.length) questions.push("No coach names were found.");
  else if (noCoach.length) questions.push(`No coach for: ${noCoach.slice(0, 8).map((t) => t.name).join(", ")}${noCoach.length > 8 ? ` and ${noCoach.length - 8} more` : ""}.`);
  const tiny = out.filter((t) => t.players === 1);
  if (tiny.length) questions.push(`Only one player on: ${tiny.slice(0, 8).map((t) => t.name).join(", ")}${tiny.length > 8 ? ` and ${tiny.length - 8} more` : ""}. Check the team names for typos.`);
  if (out.length > 300) questions.push(`${out.length} teams were found, which looks wrong. Check that the team column is right.`);

  return { teams: out.slice(0, 300), players, questions };
}
