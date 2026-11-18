import { describe, expect, it } from "vitest";
import { parseCsv, readRoster } from "@/lib/rosters/read";

describe("csv", () => {
  it("handles quotes, embedded commas and a byte order mark", () => {
    expect(parseCsv('﻿Team,Player\r\n"Tigers, U10","Pat ""PJ"" Lee"\nLions,Sam')).toEqual([
      ["Team", "Player"],
      ["Tigers, U10", 'Pat "PJ" Lee'],
      ["Lions", "Sam"],
    ]);
  });
  it("accepts tabs", () => {
    expect(parseCsv("Team\tPlayer\nTigers\tPat")).toEqual([["Team", "Player"], ["Tigers", "Pat"]]);
  });
});

describe("roster reader", () => {
  const csv = (s: string) => [{ name: "roster", rows: parseCsv(s) }];

  it("counts players per team and picks the coach", () => {
    const r = readRoster(
      csv(
        [
          "Spring Roster 2027",
          "",
          "Division,Team Name,Head Coach,Player First Name,Player Last Name,Parent Email",
          "U10,Tigers,Coach Lee,A,One,p1@test.invalid",
          "U10,Tigers,Coach Lee,B,Two,p2@test.invalid",
          "U10,tigers ,,C,Three,",
          "U12,Lions,Coach Ray,D,Four,",
          "U12,Lions,Coach Ray,E,Five,",
          ",,,,,",
        ].join("\n"),
      ),
    );
    expect(r.teams).toEqual([
      { name: "Tigers", division: "U10", coach: "Coach Lee", players: 3 },
      { name: "Lions", division: "U12", coach: "Coach Ray", players: 2 },
    ]);
    expect(r.players).toBe(5);
    expect(r.questions).toEqual([]);
  });

  it("does not mistake parent columns for players", () => {
    const r = readRoster(csv("Parent First Name,Parent Last Name,Team,Player First Name,Player Last Name\nMo,Parent,Tigers,A,One\nMo,Parent,Tigers,,"));
    expect(r.teams).toEqual([{ name: "Tigers", division: null, coach: null, players: 1 }]);
  });

  it("keeps no player names", () => {
    const r = readRoster(csv("Team,Player\nTigers,Secret Child\nTigers,Other Child"));
    expect(JSON.stringify(r)).not.toContain("Child");
  });

  it("asks when it cannot find teams, and flags gaps", () => {
    expect(readRoster(csv("First,Last\nA,One")).questions[0]).toMatch(/team column/);
    expect(readRoster(csv("a,b\n1,2")).questions[0]).toMatch(/header row/);
    expect(readRoster([{ name: "x", rows: [] }]).questions).toEqual(["The file is empty."]);
    const r = readRoster(csv("Team,Coach,Player\nTigers,Lee,A\nTigers,Lee,B\n,,C\nLoins,,D"));
    expect(r.questions).toEqual(["1 player has no team.", "No coach for: Loins.", "Only one player on: Loins. Check the team names for typos."]);
  });

  it("uses sheet names as teams when sheets have no team column", () => {
    const r = readRoster([
      { name: "Tigers", rows: [["First", "Last"], ["A", "One"], ["B", "Two"]] },
      { name: "Lions", rows: [["First", "Last"], ["C", "Three"], ["D", "Four"]] },
    ]);
    expect(r.teams.map((t) => [t.name, t.players])).toEqual([["Lions", 2], ["Tigers", 2]]);
    expect(r.questions.some((q) => q.includes("sheet name was used"))).toBe(true);
  });
});
