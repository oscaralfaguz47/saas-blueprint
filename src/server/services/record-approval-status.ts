import "server-only";

import type {
  PrismaClient,
  RecordApprovalStatus,
  RecordParticipantStatus,
} from "@prisma/client";
import { Prisma } from "@prisma/client";

/** Transaction client passed from caller's `prisma.$transaction(async (tx) => …)`. */
export type DbTx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export type ApprovalRecomputeTrigger =
  | "PARTICIPANT_CREATED"
  | "PARTICIPANT_REVOKED"
  | "PARTICIPANT_REACTIVATED"
  | "INTERNAL_APPROVED"
  | "INTERNAL_REJECTED"
  | "EXTERNAL_APPROVED"
  | "EXTERNAL_REJECTED";

/**
 * Pure: applies the locked state matrix to APPROVER rows (revoked rows are ignored).
 */
export function computeApprovalStatusFromParticipants(
  participants: Array<{
    status: RecordParticipantStatus;
    expiresAt: Date | null;
    revokedAt: Date | null;
  }>,
  now: Date = new Date()
): RecordApprovalStatus {
  const active = participants.filter((p) => p.revokedAt == null);

  if (active.length === 0) {
    return "NO_APPROVERS_ASSIGNED";
  }
  if (active.some((p) => p.status === "REJECTED")) {
    return "APPROVAL_REJECTED";
  }
  if (active.every((p) => p.status === "APPROVED")) {
    return "FULLY_APPROVED";
  }

  const pending = active.filter((p) => p.status === "PENDING");
  if (pending.length > 0) {
    const allPendingExpired = pending.every(
      (p) => p.expiresAt != null && p.expiresAt.getTime() < now.getTime()
    );
    if (allPendingExpired) {
      return "APPROVAL_EXPIRED";
    }
    return "WAITING_FOR_APPROVAL";
  }

  return "NOT_STARTED";
}

function buildApprovalStatusMetadata(params: {
  previousStatus: RecordApprovalStatus;
  newStatus: RecordApprovalStatus;
  triggeredByParticipantId?: string;
  triggeredByAction?: ApprovalRecomputeTrigger;
}): Prisma.InputJsonValue {
  const meta: Prisma.InputJsonValue = {
    previousStatus: params.previousStatus,
    newStatus: params.newStatus,
    triggeredByParticipantId: params.triggeredByParticipantId ?? null,
    triggeredByAction: params.triggeredByAction ?? null,
  };
  return meta;
}

/**
 * Reconciles `Record.approvalStatus` inside an existing transaction.
 * Idempotent: no writes if computed status equals current DB value.
 */
export async function recomputeApprovalStatus(
  tx: DbTx,
  params: {
    tenantId: string;
    recordId: string;
    triggeredByParticipantId?: string;
    triggeredByAction?: ApprovalRecomputeTrigger;
    actorUserId?: string | null;
    actorEmail?: string | null;
  }
): Promise<{
  previousStatus: RecordApprovalStatus;
  newStatus: RecordApprovalStatus;
  changed: boolean;
  isTerminalTransition: boolean;
}> {
  const { tenantId, recordId } = params;

  const record = await tx.record.findFirst({
    where: { id: recordId, tenantId },
    select: { approvalStatus: true, createdByUserId: true },
  });
  if (!record) {
    throw new Error("Record not found for approval recompute");
  }

  const rows = await tx.recordParticipant.findMany({
    where: {
      recordId,
      tenantId,
      participantRole: "APPROVER",
    },
    select: {
      status: true,
      expiresAt: true,
      revokedAt: true,
    },
  });

  const newStatus = computeApprovalStatusFromParticipants(rows);
  const previousStatus = record.approvalStatus;

  const isTerminalTransition =
    newStatus === "FULLY_APPROVED" || newStatus === "APPROVAL_REJECTED";

  if (newStatus === previousStatus) {
    return {
      previousStatus,
      newStatus,
      changed: false,
      isTerminalTransition,
    };
  }

  await tx.record.update({
    where: { id: recordId, tenantId },
    data: { approvalStatus: newStatus },
  });

  const metaBase = buildApprovalStatusMetadata({
    previousStatus,
    newStatus,
    triggeredByParticipantId: params.triggeredByParticipantId,
    triggeredByAction: params.triggeredByAction,
  });

  await tx.recordEvent.create({
    data: {
      tenantId,
      recordId,
      eventType: "APPROVAL_STATUS_CHANGED",
      actorUserId: params.actorUserId ?? null,
      actorEmail: params.actorEmail ?? null,
      metadata: metaBase,
    },
  });

  if (newStatus === "FULLY_APPROVED") {
    await tx.recordEvent.create({
      data: {
        tenantId,
        recordId,
        eventType: "APPROVAL_FULLY_COMPLETED",
        actorUserId: params.actorUserId ?? null,
        actorEmail: params.actorEmail ?? null,
        metadata: metaBase,
      },
    });
  }

  if (newStatus === "APPROVAL_REJECTED") {
    await tx.recordEvent.create({
      data: {
        tenantId,
        recordId,
        eventType: "APPROVAL_REJECTED_FINAL",
        actorUserId: params.actorUserId ?? null,
        actorEmail: params.actorEmail ?? null,
        metadata: metaBase,
      },
    });
  }

  const auditActorUserId = params.actorUserId ?? record.createdByUserId;
  if (!auditActorUserId) {
    throw new Error(
      "Cannot write approval status audit log: missing actorUserId and record.createdByUserId"
    );
  }

  await tx.auditLog.create({
    data: {
      actorUserId: auditActorUserId,
      actorContext: "TENANT",
      tenantId,
      action: "record.approval_status.changed",
      targetType: "Record",
      targetId: recordId,
      metadata: metaBase,
    },
  });

  return {
    previousStatus,
    newStatus,
    changed: true,
    isTerminalTransition,
  };
}
