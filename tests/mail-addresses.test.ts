import { describe, expect, it } from "vitest";
import { addressesOf, fieldHasAddress, firstAddress, splitAddresses } from "@/lib/mail/addresses";

describe("email fields with more than one address", () => {
  it("splits on semicolons, commas and spaces, and drops repeats", () => {
    expect(splitAddresses("A@x.org; b@y.org")).toEqual(["A@x.org", "b@y.org"]);
    expect(splitAddresses("a@x.org,b@y.org  <c@z.org>")).toEqual(["a@x.org", "b@y.org", "c@z.org"]);
    expect(splitAddresses("a@x.org; A@X.ORG")).toEqual(["a@x.org"]);
    expect(splitAddresses("call the office")).toEqual([]);
    expect(splitAddresses(null)).toEqual([]);
  });

  it("uses the first address for the portal link", () => {
    expect(firstAddress("a@x.org; b@y.org")).toBe("a@x.org");
    expect(firstAddress("")).toBeNull();
  });

  it("lists every address across a job's contacts once", () => {
    expect(addressesOf([{ email: "a@x.org; b@y.org" }, { email: null }, { email: "B@y.org" }, { email: "c@z.org" }])).toEqual([
      "a@x.org",
      "b@y.org",
      "c@z.org",
    ]);
  });

  it("matches a To address against either address in the field", () => {
    expect(fieldHasAddress("a@x.org; b@y.org", ["B@Y.org"])).toBe(true);
    expect(fieldHasAddress("a@x.org; b@y.org", ["c@z.org"])).toBe(false);
    expect(fieldHasAddress(null, ["a@x.org"])).toBe(false);
  });
});
