import { hasVendorPermission, type VendorPermission } from "@/server/security/vendor-authorization";
import type { RoleKey } from "@/types/next-auth";

export async function requirePlatformPermission(params: {
  userId: string;
  legacyRole?: RoleKey;
  permission: VendorPermission;
}) {
  const ok = await hasVendorPermission(params);
  if (!ok) throw new Error("UNAUTHORIZED");
}
