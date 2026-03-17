import "server-only";

import { prisma } from "@/server/db";
import { Prisma } from "@prisma/client";

type ActorContext = "TENANT" | "VENDOR";

export async function writeAuditLog(params: {
  actorUserId: string;
  actorContext: ActorContext;
  tenantId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetUserId?: string | null;

  // Use Prisma JSON input type
  metadata?: Prisma.InputJsonValue;

  /** Include when available for request correlation (observability rule). */
  requestId?: string | null;

  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const {
    actorUserId,
    actorContext,
    tenantId,
    action,
    targetType,
    targetId,
    targetUserId,
    metadata,
    requestId,
    ipAddress,
    userAgent,
  } = params;

  const mergedMetadata: Prisma.InputJsonValue | undefined =
    requestId != null
      ? {
          ...(typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
            ? (metadata as Record<string, unknown>)
            : {}),
          requestId,
        }
      : metadata;

  await prisma.auditLog.create({
    data: {
      actorUserId,
      actorContext,
      tenantId: tenantId ?? null,
      action,
      targetType: targetType ?? null,
      targetId: targetId ?? null,
      targetUserId: targetUserId ?? null,

      ...(mergedMetadata !== undefined ? { metadata: mergedMetadata } : {}),

      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    },
  });
}
