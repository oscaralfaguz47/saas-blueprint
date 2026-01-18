import { prisma } from "@/server/db";
import type { RoleKey } from "@/types/next-auth";

export type VendorPermission =
  | "admin.tenants.read"
  | "admin.tenants.suspend"
  | "admin.users.read"
  | "admin.users.block"
  | "admin.sessions.revoke"
  | "admin.mfa.reset"
  | "admin.billing.read"
  | "admin.audit.read";

/**
 * Returns true if the user has the given vendor permission.
 * Uses DB roles/permissions as source of truth.
 * Includes a temporary fallback mapping from legacy User.role
 * to avoid breaking existing behavior during migration.
 */
export async function hasVendorPermission(params: {
  userId: string;
  legacyRole?: RoleKey;
  permission: VendorPermission;
}): Promise<boolean> {
  const { userId, legacyRole, permission } = params;

  // Temporary fallback mapping (keep until we fully migrate off User.role)
  if (legacyRole === "ADMIN") return true;
  if (legacyRole === "MANAGER") {
    // Managers get a subset (adjust later)
    return (
      permission === "admin.tenants.read" ||
      permission === "admin.users.read" ||
      permission === "admin.sessions.revoke" ||
      permission === "admin.mfa.reset" ||
      permission === "admin.audit.read"
    );
  }

  // DB-driven permissions
  const row = await prisma.vendorUserRole.findFirst({
    where: { userId },
    select: {
      role: {
        select: {
          permissions: {
            select: {
              permission: { select: { code: true } },
            },
          },
        },
      },
    },
  });

  if (!row) return false;

  const codes = new Set(
    row.role.permissions.map((rp) => rp.permission.code)
  );

  return codes.has(permission);
}
