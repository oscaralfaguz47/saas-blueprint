import "server-only";

import type { FinanceStatus } from "@prisma/client";

import type { DbTx } from "./record-approval-status";

export type { DbTx };

export class FinanceStatusTransitionError extends Error {
  constructor(public reason: "INVALID_STATE_TRANSITION" | "RECORD_NOT_FOUND") {
    super(`finance-status: ${reason}`);
    this.name = "FinanceStatusTransitionError";
  }
}

export type RecomputeFinanceStatusInput = {
  tenantId: string;
  recordId: string;
  newStatus: FinanceStatus;
  newAssigneeId?: string | null;
  newAssignedAt?: Date | null;
  newAssignedByRuleId?: string | null;
  expectFromStatus?: FinanceStatus | FinanceStatus[];
  expectFromAssignee?: string | null;
  decrementMembershipId?: string;
  incrementMembershipId?: string;
};

export type RecomputeFinanceStatusResult = {
  previousStatus: FinanceStatus;
  newStatus: FinanceStatus;
  /** True only when `financeStatus` differs from pre-read; assignee-only changes may still yield false. */
  changed: boolean;
  previousAssigneeId: string | null;
  newAssigneeId: string | null;
};

/**
 * CAS `updateMany` for finance assignment + status, then optional workload counters, inside caller's transaction.
 * Does not create RecordEvent or AuditLog.
 */
export async function recomputeFinanceStatus(
  tx: DbTx,
  params: RecomputeFinanceStatusInput
): Promise<RecomputeFinanceStatusResult> {
  const { tenantId, recordId } = params;

  const current = await tx.record.findFirst({
    where: { id: recordId, tenantId },
    select: { financeStatus: true, financeAssignedMembershipId: true },
  });
  if (!current) {
    throw new FinanceStatusTransitionError("RECORD_NOT_FOUND");
  }

  const where: {
    id: string;
    tenantId: string;
    financeStatus?: FinanceStatus | { in: FinanceStatus[] };
    financeAssignedMembershipId?: string | null;
  } = { id: recordId, tenantId };

  if (params.expectFromStatus !== undefined) {
    where.financeStatus = Array.isArray(params.expectFromStatus)
      ? { in: params.expectFromStatus }
      : params.expectFromStatus;
  }
  if (params.expectFromAssignee !== undefined) {
    where.financeAssignedMembershipId = params.expectFromAssignee;
  }

  const data: {
    financeStatus: FinanceStatus;
    financeAssignedMembershipId?: string | null;
    financeAssignedAt?: Date | null;
    financeAssignedByRuleId?: string | null;
  } = { financeStatus: params.newStatus };

  if (params.newAssigneeId !== undefined) {
    data.financeAssignedMembershipId = params.newAssigneeId;
  }
  if (params.newAssignedAt !== undefined) {
    data.financeAssignedAt = params.newAssignedAt;
  }
  if (params.newAssignedByRuleId !== undefined) {
    data.financeAssignedByRuleId = params.newAssignedByRuleId;
  }

  const updated = await tx.record.updateMany({ where, data });
  if (updated.count !== 1) {
    throw new FinanceStatusTransitionError("INVALID_STATE_TRANSITION");
  }

  if (params.decrementMembershipId) {
    await tx.tenantMembership.update({
      where: { id: params.decrementMembershipId, tenantId },
      data: { financeOpenAssignmentsCount: { decrement: 1 } },
    });
  }
  if (params.incrementMembershipId) {
    await tx.tenantMembership.update({
      where: { id: params.incrementMembershipId, tenantId },
      data: { financeOpenAssignmentsCount: { increment: 1 } },
    });
  }

  return {
    previousStatus: current.financeStatus,
    newStatus: params.newStatus,
    changed: current.financeStatus !== params.newStatus,
    previousAssigneeId: current.financeAssignedMembershipId,
    newAssigneeId:
      params.newAssigneeId !== undefined
        ? params.newAssigneeId
        : current.financeAssignedMembershipId,
  };
}
