import "server-only";

import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import type { TenantPermission } from "@/server/security/tenant-authorization";
import { prisma } from "@/server/db";
import type { Session } from "next-auth";

const COOKIE_NAME = "active_tenant_id";
const HEADER_NAME = "x-tenant-id";

export type GetCurrentTenantIdOptions = {
  session: Session | null;
  req?: Request;
};

/**
 * Resolve current tenant for billing (and workspace-scoped) operations.
 * 1) Prefer signed server-side context: cookie "active_tenant_id" or header "x-tenant-id", validated against ACTIVE membership.
 * 2) Fallback: getDefaultTenantForUser (log warning when fallback used).
 * Returns tenantId or null if user has no tenant.
 */
export async function getCurrentTenantId(
  options: GetCurrentTenantIdOptions
): Promise<string | null> {
  const { session, req } = options;
  if (!session?.user?.id) return null;

  const userId = session.user.id;

  let candidateId: string | null = null;
  if (req) {
    const cookieHeader = req.headers.get("cookie");
    if (cookieHeader) {
      const match = cookieHeader.match(
        new RegExp(`${COOKIE_NAME}=([a-zA-Z0-9_-]+)`)
      );
      if (match?.[1]) candidateId = match[1];
    }
    if (!candidateId) {
      const header = req.headers.get(HEADER_NAME);
      if (header?.trim()) candidateId = header.trim();
    }
  }

  if (candidateId) {
    const membership = await prisma.tenantMembership.findUnique({
      where: {
        tenantId_userId: { tenantId: candidateId, userId },
      },
      select: {
        tenantId: true,
        status: true,
        tenant: { select: { status: true } },
      },
    });
    if (
      membership?.status === "ACTIVE" &&
      (membership.tenant.status === "ACTIVE" || membership.tenant.status === "SUSPENDED")
    ) {
      return membership.tenantId;
    }
  }

  const membership = await getDefaultTenantForUser(userId);
  if (membership && candidateId && membership.tenant.id !== candidateId) {
    console.warn(
      "[billing/tenant-context] No valid active_tenant_id for user; using default tenant."
    );
  }
  return membership?.tenant?.id ?? null;
}

/**
 * Get current tenant ID or throw (for use in handlers that require a tenant).
 * Use with ApiErrors.NO_TENANT() when you need to return a response instead of throwing.
 */
export async function getTenantContextOrThrow(options: GetCurrentTenantIdOptions): Promise<{
  tenantId: string;
}> {
  const tenantId = await getCurrentTenantId(options);
  if (!tenantId) {
    throw new Error("NO_TENANT");
  }
  return { tenantId };
}

/**
 * Require tenant permission; returns null if allowed, or a NextResponse to return (403) if forbidden.
 * Use after getCurrentTenantId: if (permissionError) return permissionError;
 */
export async function requireTenantPermission(params: {
  userId: string;
  tenantId: string;
  permission: TenantPermission;
}): Promise<ReturnType<typeof import("@/lib/api-response").apiError> | null> {
  const allowed = await hasTenantPermission(params);
  if (allowed) return null;
  const { apiError } = await import("@/lib/api-response");
  return apiError("FORBIDDEN", 403, "Insufficient permissions");
}
