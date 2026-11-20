import { describe, expect, it } from "vitest";
import { activeHref } from "@/lib/menu";

const hrefs = ["/", "/jobs", "/crew", "/crew/pay", "/settings"];

describe("activeHref", () => {
  it("lights Today only on the home page", () => {
    expect(activeHref("/", hrefs)).toBe("/");
    expect(activeHref("/jobs/abc", hrefs)).toBe("/jobs");
  });
  it("picks the longest entry a page sits under", () => {
    expect(activeHref("/crew/pay", hrefs)).toBe("/crew/pay");
    expect(activeHref("/crew/pay/export", hrefs)).toBe("/crew/pay");
    expect(activeHref("/crew/123", hrefs)).toBe("/crew");
  });
  it("does not match a page that only shares a prefix of the name", () => {
    expect(activeHref("/crewless", hrefs)).toBeNull();
    expect(activeHref("/field/1", hrefs)).toBeNull();
  });
});
