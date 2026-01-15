export type RoleKey = "ADMIN" | "MANAGER" | "MEMBER";

export function requireRole(
  role: RoleKey | undefined,
  allowed: RoleKey[]
) {
  if (!role || !allowed.includes(role)) {
    throw new Error("UNAUTHORIZED");
  }
}
