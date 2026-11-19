import { describe, expect, it } from "vitest";
import { bySection, placeOf, telHref } from "@/lib/gear/field";

describe("field view helpers", () => {
  it("builds one address line and a map link", () => {
    const p = placeOf({ location_name: "Main Park", address: "1 Elm St", city: "Springfield", state: "PA", zip: "19000" });
    expect(p.line).toBe("Main Park, 1 Elm St, Springfield, PA, 19000");
    expect(p.mapUrl).toBe("https://www.google.com/maps/search/?api=1&query=1%20Elm%20St%2C%20Springfield%2C%20PA%2C%2019000");
    expect(placeOf({ location_name: null, address: null, city: "Springfield", state: null, zip: null }).mapUrl).toBeNull();
  });
  it("groups a checklist by section in order", () => {
    const g = bySection([{ section: "A", n: 1 }, { section: "B", n: 2 }, { section: "A", n: 3 }]);
    expect(g.map(([s, i]) => [s, i.length])).toEqual([["A", 2], ["B", 1]]);
  });
  it("makes a phone link only from a real number", () => {
    expect(telHref("(215) 555-0100")).toBe("tel:2155550100");
    expect(telHref("+1 215 555 0100")).toBe("tel:+12155550100");
    expect(telHref("call me")).toBeNull();
  });
});
