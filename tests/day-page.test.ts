import { describe, expect, it } from "vitest";
import { makeSlug, mapsHref, placeLine, safeShopUrl, teamTimes } from "@/lib/public/day-page";

describe("day page", () => {
  it("makes a readable slug with a random tail", () => {
    const s = makeSlug("Spring Ball 2027: Ñandú League!", () => 0);
    expect(s).toBe("spring-ball-2027-nandu-league-aaaaa");
    expect(makeSlug("!!!", () => 0.99)).toMatch(/^photo-day-[a-z0-9]{5}$/);
    expect(makeSlug("x".repeat(90)).length).toBeLessThanOrEqual(80);
  });

  it("builds the place line and a maps link", () => {
    const d = { location_name: "Field 3", address: "1 Main St", city: "Town", state: "PA", zip: "19000" };
    expect(placeLine(d)).toBe("1 Main St, Town, PA 19000");
    expect(mapsHref(d)).toContain("Field%203");
    expect(mapsHref({ location_name: null, address: null, city: null, state: null, zip: null })).toBeNull();
  });

  it("only allows web links for the shop", () => {
    expect(safeShopUrl("javascript:alert(1)")).toBeNull();
    expect(safeShopUrl("https://shop.example.com/x")).toBe("https://shop.example.com/x");
    expect(safeShopUrl("not a url")).toBeNull();
  });

  it("groups team times and filters by name", () => {
    const teams = [
      { team: "Tigers", division: "U10", time: "09:15:00" },
      { team: "Lions", division: null, time: "09:00:00" },
      { team: "Bears", division: "U10", time: "09:15:00" },
    ];
    expect(teamTimes(teams)).toEqual([
      { time: "09:00", teams: ["Lions"] },
      { time: "09:15", teams: ["Tigers (U10)", "Bears (U10)"] },
    ]);
    expect(teamTimes(teams, "tig")).toEqual([{ time: "09:15", teams: ["Tigers (U10)"] }]);
  });
});
