import { hasVendorPermission } from "@/server/security/vendor-authorization";
import type { RoleKey } from "@/types/next-auth";

export async function requireVendorPermission(params: {
  userId: string;
  legacyRole?: RoleKey;
  permission:
    | "admin.tenants.read"
    | "admin.tenants.suspend"
    | "admin.users.read"
    | "admin.users.block"
    | "admin.sessions.revoke"
    | "admin.mfa.reset"
    | "admin.billing.read"
    | "admin.audit.read";
}) {
  const ok = await hasVendorPermission(params);
  if (!ok) throw new Error("UNAUTHORIZED");
}
