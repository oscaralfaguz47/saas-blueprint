export type AppRole = "ADMIN" | "MANAGER" | "MEMBER";

export function requireRole(userRole: AppRole, allowed: AppRole[]) {
  if (!allowed.includes(userRole)) {
    throw new Error("FORBIDDEN");
  }
}
