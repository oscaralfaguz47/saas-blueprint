import type { RoleKey } from "@/types/next-auth";

export function requireRole(role: RoleKey | undefined, allowed: RoleKey[]) {
  if (!role || !allowed.includes(role)) {
    throw new Error("UNAUTHORIZED");
  }
}
