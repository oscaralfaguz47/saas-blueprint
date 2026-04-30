import "server-only";

import { hasVendorPermission, type VendorPermission } from "@/server/security/vendor-authorization";

export async function requirePlatformPermission(params: {
  userId: string;
  permission: VendorPermission;
}) {
  const ok = await hasVendorPermission(params);
  if (!ok) throw new Error("UNAUTHORIZED");
}
