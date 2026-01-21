import { hasTenantPermission, TenantPermission } from "@/server/security/tenant-authorization";

export async function requireTenantPermission(params: {
  userId: string;
  tenantId: string;
  permission: TenantPermission;
}) {
  const ok = await hasTenantPermission(params);
  if (!ok) throw new Error("UNAUTHORIZED");
}
