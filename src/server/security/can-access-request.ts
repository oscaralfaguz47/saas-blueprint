import "server-only";

import { prisma } from "@/server/db";
import { hasTenantPermission } from "@/server/security/tenant-authorization";

/**
 * Determines whether a user can access a specific request (record).
 *
 * Per authorization-rbac-and-request-access.md, a user may access a request if ANY is true:
 * 1. The user created the request
 * 2. The user is an assigned internal participant (RequestParticipant) — NOT YET IN SCHEMA
 * 3. The user has shared access (RequestShare) — NOT YET IN SCHEMA
 * 4. The user has `tenant.requests.read_all`
 *
 * When participants / shares tables are added to the schema, expand the OR clause below.
 * If access is denied, callers should return 404 (not 403) to avoid revealing existence.
 */
export async function canAccessRequest(params: {
  tenantId: string;
  userId: string;
  requestId: string;
}): Promise<boolean> {
  const { tenantId, userId, requestId } = params;

  // 1. Check if user has tenant.requests.read_all (RBAC shortcut)
  const hasReadAll = await hasTenantPermission({
    userId,
    tenantId,
    permission: "tenant.requests.read_all",
  });
  if (hasReadAll) return true;

  // 2. Check creator (and future: participant / shared access) in a single query
  //    TODO: When RequestParticipant and RequestShare models are added,
  //    expand this OR clause with:
  //      { participants: { some: { userId, status: "ACTIVE" } } },
  //      { shares: { some: { sharedWithUserId: userId, revokedAt: null } } },
  const record = await prisma.record.findFirst({
    where: {
      id: requestId,
      tenantId,
      OR: [
        { createdByUserId: userId },
      ],
    },
    select: { id: true },
  });

  return record !== null;
}
