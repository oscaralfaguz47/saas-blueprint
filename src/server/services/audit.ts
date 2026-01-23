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
    ipAddress,
    userAgent,
  } = params;

  await prisma.auditLog.create({
    data: {
      actorUserId,
      actorContext,
      tenantId: tenantId ?? null,
      action,
      targetType: targetType ?? null,
      targetId: targetId ?? null,
      targetUserId: targetUserId ?? null,

      // IMPORTANT: only set when defined (no null)
      ...(metadata !== undefined ? { metadata } : {}),

      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    },
  });
}
