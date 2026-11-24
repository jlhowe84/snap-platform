// Which roles a team member's form may change, and what a save adds and removes.

export const GRANTABLE = ["admin", "office", "support", "crew"] as const;
export type Grantable = (typeof GRANTABLE)[number];

/** The roles this viewer may tick or untick. Only the owner hands out Admin. */
export function editableRoles(viewerRoles: readonly string[]): Grantable[] {
  if (viewerRoles.includes("owner")) return [...GRANTABLE];
  if (viewerRoles.includes("admin")) return GRANTABLE.filter((r) => r !== "admin");
  return [];
}

export type RoleChange = { add: Grantable[]; remove: Grantable[] } | { problem: string };

/**
 * Compare what was ticked with what the person holds. Owner and coordinator
 * roles are never touched here, and nobody is left with no staff role.
 */
export function roleChange(o: { viewerRoles: readonly string[]; self: boolean; current: readonly string[]; wanted: readonly string[] }): RoleChange {
  const may = editableRoles(o.viewerRoles);
  if (!may.length) return { problem: "Only an owner or admin can change roles." };
  const wanted = new Set(o.wanted.filter((r): r is Grantable => (may as string[]).includes(r)));
  const add = may.filter((r) => wanted.has(r) && !o.current.includes(r));
  const remove = may.filter((r) => !wanted.has(r) && o.current.includes(r));
  if (o.self && remove.includes("admin") && !o.current.includes("owner")) return { problem: "You cannot remove your own Admin role." };
  const left = o.current.filter((r) => r !== "coordinator" && !(remove as string[]).includes(r)).length + add.length;
  if (left === 0) return { problem: "Pick at least one role." };
  return { add, remove };
}
