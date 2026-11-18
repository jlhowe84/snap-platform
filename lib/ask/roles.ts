import type { AppRole } from "@/lib/auth";

// Who may use Ask SNAP. Matches private.is_staff() in the database, which is
// what ask_snap_begin checks.
export const ASK_ROLES: readonly AppRole[] = ["owner", "admin", "office", "support"];
