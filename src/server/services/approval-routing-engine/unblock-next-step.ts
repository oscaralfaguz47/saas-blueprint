import "server-only";

import { Prisma, RecordEventType } from "@prisma/client";
import type { DbTx } from "@/server/services/record-approval-status";

export type RoutingParticipantSnapshot = {
  id: string;
  userId: string | null;
  status: "PENDING" | "PENDING_BLOCKED" | "APPROVED" | "REJECTED";
  sequenceOrder: number | null;
  routingRuleId: string;
};

export type UnblockNextStepResult = {
  unblockedCount: number;
  unblockedRows: Array<{
    id: string;
    userId: string | null;
    sequenceOrder: number | null;
    routingRuleId: string | null;
  }>;
  sequenceOrder: number | null;
  routingRuleId: string | null;
};

/**
 * Manual approvers (routingRuleId null) are excluded before this runs — they are not part of
 * sequential routing steps. Defensive: rows with null sequenceOrder are ignored (invalid for steps).
 */
export function computeNextStepToUnblock(
  participants: RoutingParticipantSnapshot[]
): { sequenceOrder: number; participantIdsToUnblock: string[] } | null {
  if (participants.length === 0) {
    return null;
  }

  const valid = participants.filter(
    (p) => p.sequenceOrder != null && Number.isFinite(p.sequenceOrder)
  );
  if (valid.length === 0) {
    return null;
  }

  const byOrder = new Map<number, RoutingParticipantSnapshot[]>();
  for (const p of valid) {
    const o = p.sequenceOrder as number;
    const list = byOrder.get(o) ?? [];
    list.push(p);
    byOrder.set(o, list);
  }

  const orders = [...byOrder.keys()].sort((a, b) => a - b);

  for (const order of orders) {
    const rows = byOrder.get(order) ?? [];
    if (rows.length === 0) {
      continue;
    }
    const allApproved = rows.every((p) => p.status === "APPROVED");
    if (!allApproved) {
      if (rows.some((p) => p.status === "PENDING")) {
        return null;
      }
      const blockedIds = rows
        .filter((p) => p.status === "PENDING_BLOCKED")
        .map((p) => p.id);
      if (blockedIds.length === 0) {
        return null;
      }
      return { sequenceOrder: order, participantIdsToUnblock: blockedIds };
    }
  }

  return null;
}

/**
 * CAS unblock + RecordEvent + AuditLog only (no recompute — hook owns that).
 */
export async function unblockNextStepIfReady(
  tx: DbTx,
  params: {
    tenantId: string;
    recordId: string;
    actorUserId: string;
  }
): Promise<UnblockNextStepResult> {
  const rows = await tx.recordParticipant.findMany({
    where: {
      tenantId: params.tenantId,
      recordId: params.recordId,
      participantRole: "APPROVER",
      revokedAt: null,
      routingRuleId: { not: null },
    },
    select: {
      id: true,
      userId: true,
      status: true,
      sequenceOrder: true,
      routingRuleId: true,
    },
  });

  const snapshots: RoutingParticipantSnapshot[] = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    status: r.status as RoutingParticipantSnapshot["status"],
    sequenceOrder: r.sequenceOrder,
    routingRuleId: r.routingRuleId!,
  }));

  const next = computeNextStepToUnblock(snapshots);
  if (!next) {
    return {
      unblockedCount: 0,
      unblockedRows: [],
      sequenceOrder: null,
      routingRuleId: null,
    };
  }

  const updateResult = await tx.recordParticipant.updateMany({
    where: {
      id: { in: next.participantIdsToUnblock },
      tenantId: params.tenantId,
      participantRole: "APPROVER",
      status: "PENDING_BLOCKED",
      routingRuleId: { not: null },
      revokedAt: null,
    },
    data: { status: "PENDING" },
  });

  if (updateResult.count === 0) {
    return {
      unblockedCount: 0,
      unblockedRows: [],
      sequenceOrder: null,
      routingRuleId: null,
    };
  }

  const unblockedRows = await tx.recordParticipant.findMany({
    where: {
      id: { in: next.participantIdsToUnblock },
      tenantId: params.tenantId,
      status: "PENDING",
      participantRole: "APPROVER",
      routingRuleId: { not: null },
    },
    select: {
      id: true,
      userId: true,
      sequenceOrder: true,
      routingRuleId: true,
    },
  });

  const routingRuleId = unblockedRows[0]?.routingRuleId ?? null;

  await tx.recordEvent.create({
    data: {
      tenantId: params.tenantId,
      recordId: params.recordId,
      eventType: RecordEventType.APPROVERS_UNBLOCKED,
      actorUserId: params.actorUserId,
      metadata: {
        sequenceOrder: next.sequenceOrder,
        unblockedCount: updateResult.count,
        participantIds: unblockedRows.map((r) => r.id),
        ruleId: routingRuleId,
      } as Prisma.InputJsonValue,
    },
  });

  await tx.auditLog.create({
    data: {
      actorUserId: params.actorUserId,
      actorContext: "TENANT",
      tenantId: params.tenantId,
      action: "record.approvers.unblocked",
      targetType: "Record",
      targetId: params.recordId,
      metadata: {
        sequenceOrder: next.sequenceOrder,
        unblockedCount: updateResult.count,
        participantIds: unblockedRows.map((r) => r.id),
        ruleId: routingRuleId,
      } as Prisma.InputJsonValue,
    },
  });

  return {
    unblockedCount: updateResult.count,
    unblockedRows,
    sequenceOrder: next.sequenceOrder,
    routingRuleId,
  };
}
