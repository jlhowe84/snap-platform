import { describe, expect, it } from "vitest";
import { editableRoles, roleChange } from "@/lib/team/roles";

describe("team roles", () => {
  it("lets only the owner hand out Admin", () => {
    expect(editableRoles(["owner"])).toContain("admin");
    expect(editableRoles(["admin"])).toEqual(["office", "support", "crew"]);
    expect(editableRoles(["office"])).toEqual([]);
  });

  it("adds a role and keeps the rest", () => {
    expect(roleChange({ viewerRoles: ["owner"], self: false, current: ["office"], wanted: ["office", "crew"] })).toEqual({ add: ["crew"], remove: [] });
  });

  it("removes an unticked role", () => {
    expect(roleChange({ viewerRoles: ["owner"], self: false, current: ["office", "crew"], wanted: ["crew"] })).toEqual({ add: [], remove: ["office"] });
  });

  it("leaves Admin alone when an admin saves", () => {
    expect(roleChange({ viewerRoles: ["admin"], self: false, current: ["admin", "office"], wanted: ["office", "admin", "crew"] })).toEqual({ add: ["crew"], remove: [] });
    expect(roleChange({ viewerRoles: ["admin"], self: false, current: ["admin"], wanted: [] })).toEqual({ add: [], remove: [] });
  });

  it("never touches owner or coordinator", () => {
    expect(roleChange({ viewerRoles: ["owner"], self: true, current: ["owner", "coordinator"], wanted: ["owner", "crew"] })).toEqual({ add: ["crew"], remove: [] });
  });

  it("refuses to leave someone with no staff role", () => {
    expect(roleChange({ viewerRoles: ["owner"], self: false, current: ["office", "coordinator"], wanted: [] })).toHaveProperty("problem");
  });

  it("refuses a non-admin", () => {
    expect(roleChange({ viewerRoles: ["office"], self: false, current: ["crew"], wanted: ["office"] })).toHaveProperty("problem");
  });
});
