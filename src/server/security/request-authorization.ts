import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { hasTenantPermission } from "./tenant-authorization";

/**
 * C1 — Central access check for all record (request) operations.
 *
 * A user can access a record if ANY of the following is true:
 * 1. They are the creator
 * 2. They are an active internal participant (RecordParticipant, any role)
 * 3. They have an explicit RecordAccess entry
 * 4. They have permission tenant.requests.read_all
 *
 * Always returns false (not throws) — callers decide 403 vs 404.
 * Always tenant-scoped — never trust recordId alone.
 */
export async function canAccessRequest({
  tenantId,
  userId,
  requestId,
}: {
  tenantId: string;
  userId: string;
  requestId: string;
}): Promise<boolean> {
  const record = await prisma.record.findFirst({
    where: { id: requestId, tenantId },
    select: {
      createdByUserId: true,
      participants: {
        where: { userId, participantType: "INTERNAL", revokedAt: null },
        select: { id: true },
        take: 1,
      },
      access: {
        where: { userId },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!record) return false;

  // 1. Creator
  if (record.createdByUserId === userId) return true;

  // 2. Internal participant (RecordParticipant — new model)
  if (record.participants.length > 0) return true;

  // 3. Explicit share (RecordAccess)
  if (record.access.length > 0) return true;

  // 4. read_all permission
  const canReadAll = await hasTenantPermission({
    userId,
    tenantId,
    permission: "tenant.requests.read_all",
  });
  if (canReadAll) return true;

  return false;
}

/**
 * Lightweight list-query filter for tenant-scoped record queries.
 * Returns a Prisma WHERE fragment that enforces C1 access rules at query level.
 * Use this inside findMany — never fetch all and filter in memory.
 *
 * Usage:
 *   const filter = buildRecordAccessFilter({ tenantId, userId, canReadAll });
 *   prisma.record.findMany({ where: { tenantId, ...filter } })
 */
export function buildRecordAccessFilter({
  tenantId: _tenantId,
  userId,
  canReadAll,
}: {
  tenantId: string;
  userId: string;
  canReadAll: boolean;
}): Prisma.RecordWhereInput {
  if (canReadAll) return {};

  return {
    OR: [
      { createdByUserId: userId },
      {
        participants: {
          some: { userId, participantType: "INTERNAL", revokedAt: null },
        },
      },
      {
        access: {
          some: { userId },
        },
      },
    ],
  };
}
