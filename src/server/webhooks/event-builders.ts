import "server-only";

/** Pure payload `data` subtrees for outbound webhooks (envelope built in enqueue.ts). No DB, no emails. */

export type RecordCreatedData = {
  id: string;
  name: string;
  type: string;
  status: string;
  createdAt: string;
  createdByUserId: string;
  recordKey: string | null;
};

export function buildRecordCreatedData(input: {
  id: string;
  title: string;
  type: string;
  status: string;
  createdAt: Date;
  createdByUserId: string;
  recordKey: string | null;
}): Record<string, unknown> {
  return {
    id: input.id,
    name: input.title,
    type: input.type,
    status: input.status,
    createdAt: input.createdAt.toISOString(),
    createdByUserId: input.createdByUserId,
    recordKey: input.recordKey,
  };
}

export type RecordFinanceAssignedData = {
  recordId: string;
  assignedToUserId: string;
  membershipId: string;
  ruleId: string;
  ruleName: string;
  evaluationId: string;
  assignedAt: string;
  strategy: string;
};

export function buildRecordFinanceAssignedData(input: {
  recordId: string;
  assignedToUserId: string;
  membershipId: string;
  ruleId: string;
  ruleName: string;
  evaluationId: string;
  assignedAt: Date;
  strategy: string;
}): Record<string, unknown> {
  return {
    recordId: input.recordId,
    assignedToUserId: input.assignedToUserId,
    membershipId: input.membershipId,
    assignmentRule: {
      ruleId: input.ruleId,
      ruleName: input.ruleName,
    },
    evaluationId: input.evaluationId,
    assignedAt: input.assignedAt.toISOString(),
    strategy: input.strategy,
  };
}

export type ApprovalRequestedApprover = {
  userId: string;
  sequenceOrder: number;
  routingApproverId: string;
};

export function buildRecordApprovalRequestedData(input: {
  recordId: string;
  ruleId: string;
  evaluationId: string;
  requestedAt: Date;
  approvers: ApprovalRequestedApprover[];
}): Record<string, unknown> {
  return {
    recordId: input.recordId,
    ruleId: input.ruleId,
    evaluationId: input.evaluationId,
    requestedAt: input.requestedAt.toISOString(),
    approvers: input.approvers.map((a) => ({
      userId: a.userId,
      sequenceOrder: a.sequenceOrder,
      routingApproverId: a.routingApproverId,
    })),
  };
}

export type ApprovalCompletedApprover = {
  participantId: string;
  userId: string;
  status: string;
};

export function buildRecordApprovalCompletedData(input: {
  recordId: string;
  completedAt: Date;
  approvers: ApprovalCompletedApprover[];
}): Record<string, unknown> {
  return {
    recordId: input.recordId,
    completedAt: input.completedAt.toISOString(),
    approvers: input.approvers.map((a) => ({
      participantId: a.participantId,
      userId: a.userId,
      status: a.status,
    })),
  };
}

export function buildRecordPaymentStatusChangedData(input: {
  recordId: string;
  paymentId: string;
  previousStatus: string | null;
  newStatus: string;
  changedAt: Date;
}): Record<string, unknown> {
  return {
    recordId: input.recordId,
    paymentId: input.paymentId,
    previousStatus: input.previousStatus,
    newStatus: input.newStatus,
    changedAt: input.changedAt.toISOString(),
  };
}

export function buildRecordClosedData(input: {
  recordId: string;
  closedAt: Date;
  closedByUserId: string;
}): Record<string, unknown> {
  return {
    recordId: input.recordId,
    closedAt: input.closedAt.toISOString(),
    closedByUserId: input.closedByUserId,
  };
}
