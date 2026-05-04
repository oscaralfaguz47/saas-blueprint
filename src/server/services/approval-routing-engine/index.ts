import "server-only";

import type { Record } from "@prisma/client";
import {
  ApprovalRoutingOutcome,
  ApproverTargetType,
  NotificationType,
  Prisma,
  RecordEventType,
} from "@prisma/client";
import type { FinanceAssignmentRuleCondition } from "@prisma/client";
import { prisma } from "@/server/db";
import { buildRecordApprovalRequestedData } from "@/server/webhooks/event-builders";
import { enqueueWebhookEvent } from "@/server/webhooks/enqueue";
import { resolveTenantPlan } from "@/server/billing/resolve-tenant-plan";
import { evaluateApprovalRoutingPlanGate } from "@/lib/validations/approval-routing-rule";
import { evaluateCondition } from "@/server/services/finance-assignment-engine/evaluate-condition";
import { recomputeApprovalStatus } from "@/server/services/record-approval-status";
import { createNotification } from "@/server/services/notifications";
import { resolveApproversForRule } from "./resolve-approvers";

const RULES_SNAPSHOT_CAP = 100;

type TruncationMarker = { _truncated: true; omittedCount: number };

function truncateForJson<T>(items: T[], cap: number): (T | TruncationMarker)[] {
  if (items.length <= cap) return items;
  return [...items.slice(0, cap), { _truncated: true, omittedCount: items.length - cap }];
}

export const APPROVAL_ROUTING_TRIGGER_EVENTS = {
  RECORD_CREATED: "RECORD_CREATED",
  ADMIN_MANUAL_REEVALUATION: "ADMIN_MANUAL_REEVALUATION",
} as const;

export type EvaluateAndAssignInput = {
  tenantId: string;
  recordId: string;
  triggerEvent: string;
  triggeredByUserId?: string | null;
};

export type EvaluateAndAssignResult =
  | { skipped: true; reason: "NOT_OPEN" | "EXISTING_APPROVERS" }
  | {
      skipped: false;
      evaluationId: string;
      outcome: ApprovalRoutingOutcome;
    };

type RuleEvalSnapshot = {
  ruleId: string;
  ruleName: string;
  priority: number;
  skipped?: boolean;
  skipReason?: string;
  matched?: boolean;
  planGateOk?: boolean;
  conditionResults?: ReturnType<typeof evaluateCondition>[];
};

/**
 * 1) Load record (status, title, creator, full row for conditions).
 * 2) If status !== OPEN → return skipped (no evaluation row).
 * 3) If any active APPROVER exists → skipped (no evaluation row), except
 *    `ADMIN_MANUAL_REEVALUATION` (C14 clear-then-reeval; manuals / responded routing may remain).
 * 4) Resolve tenant plan; if approval routing disabled → persist NO_RULE_MATCHED and exit.
 * 5) Load ACTIVE trigger-on-create rules ordered by priority.
 * 6) For each rule: plan gate snapshot; skip if not entitled.
 * 7) For each rule: if any approver is CREATOR_MANAGER → skip rule (structured reason).
 * 8) Evaluate AND of conditions via finance `evaluateCondition` (routing conditions are shape-compatible).
 * 9) First matching rule wins; others recorded as evaluated non-matches.
 * 10) Resolve approvers + dedupe; if none → ERROR + NO_APPROVERS_RESOLVED detail in JSON.
 * 11) In one transaction: materialize participants (global min sequenceOrder → PENDING, else PENDING_BLOCKED),
 *     then persist ApprovalRoutingEvaluation, APPROVERS_ASSIGNED event, audit, recomputeApprovalStatus.
 *     For `RECORD_CREATED`: create-only. For `ADMIN_MANUAL_REEVALUATION`: reactivate soft-revoked routing rows,
 *     attach routing fields to active manual rows, or create — avoids @@unique([recordId, userId, APPROVER])
 *     violations after C14 clear phase (revoked rows still occupy the unique key).
 * 12) After commit: notify each PENDING assignee only (try/catch per notification).
 * 13) On thrown errors: separate transaction persists outcome ERROR with safe message.
 */
export async function evaluateAndAssign(
  input: EvaluateAndAssignInput
): Promise<EvaluateAndAssignResult> {
  const started = Date.now();
  const duration = () => Date.now() - started;
  const triggeredByUserId = input.triggeredByUserId ?? null;

  const record = await prisma.record.findFirst({
    where: { id: input.recordId, tenantId: input.tenantId },
  });
  if (!record) {
    throw new Error("Record not found for approval routing evaluation");
  }

  if (record.status !== "OPEN") {
    return { skipped: true, reason: "NOT_OPEN" };
  }

  if (input.triggerEvent !== APPROVAL_ROUTING_TRIGGER_EVENTS.ADMIN_MANUAL_REEVALUATION) {
    const existingApprovers = await prisma.recordParticipant.count({
      where: {
        tenantId: input.tenantId,
        recordId: input.recordId,
        participantRole: "APPROVER",
        revokedAt: null,
      },
    });
    if (existingApprovers > 0) {
      return { skipped: true, reason: "EXISTING_APPROVERS" };
    }
  }

  const plan = await resolveTenantPlan(input.tenantId);
  if (!plan.features.approvalRouting.enabled) {
    const evalRow = await prisma.$transaction(async (tx) => {
      return tx.approvalRoutingEvaluation.create({
        data: {
          tenantId: input.tenantId,
          recordId: input.recordId,
          triggeredByEvent: input.triggerEvent,
          triggeredByUserId,
          outcome: ApprovalRoutingOutcome.NO_RULE_MATCHED,
          matchedRuleId: null,
          rulesEvaluated: truncateForJson(
            [{ reason: "PLAN_APPROVAL_ROUTING_DISABLED" }],
            RULES_SNAPSHOT_CAP
          ) as unknown as Prisma.InputJsonValue,
          approversAssigned: [] as unknown as Prisma.InputJsonValue,
          evaluationDurationMs: duration(),
          errorMessage: null,
        },
        select: { id: true },
      });
    });
    return { skipped: false, evaluationId: evalRow.id, outcome: ApprovalRoutingOutcome.NO_RULE_MATCHED };
  }

  const rules = await prisma.approvalRoutingRule.findMany({
    where: {
      tenantId: input.tenantId,
      status: "ACTIVE",
      deletedAt: null,
      triggerOnCreate: true,
    },
    orderBy: [{ priority: "asc" }, { id: "asc" }],
    include: {
      conditions: { where: { deletedAt: null } },
      requiredApprovers: { where: { deletedAt: null } },
    },
  });

  const ruleSnapshots: RuleEvalSnapshot[] = [];
  let matchedRule: (typeof rules)[number] | null = null;

  for (const rule of rules) {
    const baseSnap: RuleEvalSnapshot = {
      ruleId: rule.id,
      ruleName: rule.name,
      priority: rule.priority,
    };

    const gate = evaluateApprovalRoutingPlanGate(plan.features.approvalRouting, {
      currentRuleCount: undefined,
      mode: rule.mode,
      escalationPolicy: rule.escalationPolicy,
      conditionFields: rule.conditions.map((c) => c.field),
    });
    if (!gate.ok) {
      ruleSnapshots.push({
        ...baseSnap,
        skipped: true,
        skipReason: `plan_gate:${gate.reason}`,
        matched: false,
        planGateOk: false,
      });
      continue;
    }

    const hasCreatorManager = rule.requiredApprovers.some(
      (a) => a.targetType === ApproverTargetType.CREATOR_MANAGER
    );
    if (hasCreatorManager) {
      console.info("[approval-routing-engine] rule skipped (CREATOR_MANAGER not supported in C13a)", {
        tenantId: input.tenantId,
        recordId: input.recordId,
        ruleId: rule.id,
      });
      ruleSnapshots.push({
        ...baseSnap,
        skipped: true,
        skipReason: "CREATOR_MANAGER_DEFERRED_C13A",
        matched: false,
        planGateOk: true,
      });
      continue;
    }

    const conditionResults = rule.conditions.map((c) =>
      evaluateCondition(c as unknown as FinanceAssignmentRuleCondition, record as Record)
    );
    const matched = conditionResults.every((r) => r.passed);
    ruleSnapshots.push({
      ...baseSnap,
      matched,
      planGateOk: true,
      conditionResults,
    });
    if (matched) {
      matchedRule = rule;
      break;
    }
  }

  if (!matchedRule) {
    const evalRow = await prisma.$transaction(async (tx) => {
      return tx.approvalRoutingEvaluation.create({
        data: {
          tenantId: input.tenantId,
          recordId: input.recordId,
          triggeredByEvent: input.triggerEvent,
          triggeredByUserId,
          outcome: ApprovalRoutingOutcome.NO_RULE_MATCHED,
          matchedRuleId: null,
          rulesEvaluated: truncateForJson(ruleSnapshots, RULES_SNAPSHOT_CAP) as unknown as Prisma.InputJsonValue,
          approversAssigned: { kept: [], discarded: [] } as unknown as Prisma.InputJsonValue,
          evaluationDurationMs: duration(),
          errorMessage: null,
        },
        select: { id: true },
      });
    });
    return { skipped: false, evaluationId: evalRow.id, outcome: ApprovalRoutingOutcome.NO_RULE_MATCHED };
  }

  try {
    const parallelRule = matchedRule.mode === "PARALLEL";
    const { kept, discarded, resolvedAttempts } = await resolveApproversForRule(
      prisma,
      input.tenantId,
      matchedRule.requiredApprovers,
      { parallelRule }
    );

    if (kept.length === 0) {
      const detail = {
        matchedRuleId: matchedRule.id,
        resolvedAttempts,
        discarded,
      };
      const evalRow = await prisma.$transaction(async (tx) => {
        return tx.approvalRoutingEvaluation.create({
          data: {
            tenantId: input.tenantId,
            recordId: input.recordId,
            triggeredByEvent: input.triggerEvent,
            triggeredByUserId,
            outcome: ApprovalRoutingOutcome.ERROR,
            matchedRuleId: matchedRule!.id,
            rulesEvaluated: truncateForJson(ruleSnapshots, RULES_SNAPSHOT_CAP) as unknown as Prisma.InputJsonValue,
            approversAssigned: {
              kept: [],
              discarded,
              detail,
            } as unknown as Prisma.InputJsonValue,
            evaluationDurationMs: duration(),
            errorMessage: "NO_APPROVERS_RESOLVED",
          },
          select: { id: true },
        });
      });
      return { skipped: false, evaluationId: evalRow.id, outcome: ApprovalRoutingOutcome.ERROR };
    }

    const minSeq = Math.min(...kept.map((k) => k.sequenceOrder));
    const approversAssignedJson = {
      kept,
      discarded,
      resolvedAttempts,
    };

    const notifyAfter: { userId: string }[] = [];

    const isAdminReevaluation =
      input.triggerEvent === APPROVAL_ROUTING_TRIGGER_EVENTS.ADMIN_MANUAL_REEVALUATION;

    const evalRow = await prisma.$transaction(async (tx) => {
      for (const row of kept) {
        const status = row.sequenceOrder === minSeq ? "PENDING" : "PENDING_BLOCKED";

        /**
         * C14 manual re-evaluation: C14 clears routing-owned rows with soft revoke; those rows
         * still occupy @@unique([recordId, userId, APPROVER]). Reactivate revoked routing rows,
         * attach routing metadata to an active manual row, or create — RECORD_CREATED stays create-only.
         */
        if (isAdminReevaluation) {
          const activeRouting = await tx.recordParticipant.findFirst({
            where: {
              tenantId: input.tenantId,
              recordId: input.recordId,
              userId: row.userId,
              participantRole: "APPROVER",
              routingRuleId: { not: null },
              revokedAt: null,
            },
          });

          if (activeRouting) {
            const preserveTerminal =
              activeRouting.status === "APPROVED" || activeRouting.status === "REJECTED";
            await tx.recordParticipant.update({
              where: { id: activeRouting.id },
              data: {
                routingRuleId: matchedRule!.id,
                routingApproverId: row.routingApproverId,
                sequenceOrder: row.sequenceOrder,
                ...(preserveTerminal ? {} : { status }),
              },
            });
            if (!preserveTerminal && status === "PENDING") {
              notifyAfter.push({ userId: row.userId });
            }
            continue;
          }

          const revokedRouting = await tx.recordParticipant.findFirst({
            where: {
              tenantId: input.tenantId,
              recordId: input.recordId,
              userId: row.userId,
              participantRole: "APPROVER",
              routingRuleId: { not: null },
              revokedAt: { not: null },
            },
            orderBy: { revokedAt: "desc" },
          });

          if (revokedRouting) {
            await tx.recordParticipant.update({
              where: { id: revokedRouting.id },
              data: {
                revokedAt: null,
                routingRuleId: matchedRule!.id,
                routingApproverId: row.routingApproverId,
                sequenceOrder: row.sequenceOrder,
                status,
              },
            });
            if (status === "PENDING") {
              notifyAfter.push({ userId: row.userId });
            }
            continue;
          }

          const activeManual = await tx.recordParticipant.findFirst({
            where: {
              tenantId: input.tenantId,
              recordId: input.recordId,
              userId: row.userId,
              participantRole: "APPROVER",
              routingRuleId: null,
              revokedAt: null,
            },
          });

          if (activeManual) {
            await tx.recordParticipant.update({
              where: { id: activeManual.id },
              data: {
                routingRuleId: matchedRule!.id,
                routingApproverId: row.routingApproverId,
                sequenceOrder: row.sequenceOrder,
              },
            });
            continue;
          }
        }

        await tx.recordParticipant.create({
          data: {
            tenantId: input.tenantId,
            recordId: input.recordId,
            participantType: "INTERNAL",
            participantRole: "APPROVER",
            userId: row.userId,
            status,
            sequenceOrder: row.sequenceOrder,
            routingRuleId: matchedRule!.id,
            routingApproverId: row.routingApproverId,
            createdByUserId: record.createdByUserId,
          },
        });
        if (status === "PENDING") {
          notifyAfter.push({ userId: row.userId });
        }
      }

      const evaluation = await tx.approvalRoutingEvaluation.create({
        data: {
          tenantId: input.tenantId,
          recordId: input.recordId,
          triggeredByEvent: input.triggerEvent,
          triggeredByUserId,
          outcome: ApprovalRoutingOutcome.APPROVERS_ASSIGNED,
          matchedRuleId: matchedRule!.id,
          rulesEvaluated: truncateForJson(ruleSnapshots, RULES_SNAPSHOT_CAP) as unknown as Prisma.InputJsonValue,
          approversAssigned: approversAssignedJson as unknown as Prisma.InputJsonValue,
          evaluationDurationMs: duration(),
          errorMessage: null,
        },
        select: { id: true },
      });

      await tx.recordEvent.create({
        data: {
          tenantId: input.tenantId,
          recordId: input.recordId,
          eventType: RecordEventType.APPROVERS_ASSIGNED,
          actorUserId: triggeredByUserId ?? record.createdByUserId,
          metadata: {
            evaluationId: evaluation.id,
            matchedRuleId: matchedRule!.id,
          } as Prisma.InputJsonValue,
        },
      });

      const auditActor = triggeredByUserId ?? record.createdByUserId;
      if (!auditActor) {
        throw new Error("Cannot audit approval routing: missing actor user id");
      }
      await tx.auditLog.create({
        data: {
          actorUserId: auditActor,
          actorContext: "TENANT",
          tenantId: input.tenantId,
          action: "record.approval_routing.matched",
          targetType: "Record",
          targetId: input.recordId,
          metadata: {
            evaluationId: evaluation.id,
            matchedRuleId: matchedRule!.id,
          } as Prisma.InputJsonValue,
        },
      });

      await recomputeApprovalStatus(tx, {
        tenantId: input.tenantId,
        recordId: input.recordId,
        triggeredByAction: "PARTICIPANT_CREATED",
        actorUserId: triggeredByUserId ?? record.createdByUserId,
      });

      return evaluation;
    });

    for (const n of notifyAfter) {
      try {
        await createNotification({
          userId: n.userId,
          type: NotificationType.RECORD_APPROVAL_REQUESTED,
          title: `Approval requested: ${record.title}`,
          entityType: "Record",
          entityId: input.recordId,
          actionUrl: `/app/queue/${input.recordId}`,
        });
      } catch (notifyErr) {
        console.error("[approval-routing-engine] createNotification failed", {
          recordId: input.recordId,
          tenantId: input.tenantId,
          userId: n.userId,
          error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
        });
      }
    }

    const requestedAt = new Date();
    try {
      await enqueueWebhookEvent({
        tenantId: input.tenantId,
        eventName: "record.approval.requested",
        recordId: input.recordId,
        occurredAt: requestedAt,
        data: buildRecordApprovalRequestedData({
          recordId: input.recordId,
          ruleId: matchedRule.id,
          evaluationId: evalRow.id,
          requestedAt,
          approvers: kept.map((k) => ({
            userId: k.userId,
            sequenceOrder: k.sequenceOrder,
            routingApproverId: k.routingApproverId,
          })),
        }),
      });
    } catch (webhookErr) {
      console.error("[approval-routing-engine] webhook enqueue defensive catch", {
        recordId: input.recordId,
        tenantId: input.tenantId,
        error: webhookErr instanceof Error ? webhookErr.message : String(webhookErr),
      });
    }

    return {
      skipped: false,
      evaluationId: evalRow.id,
      outcome: ApprovalRoutingOutcome.APPROVERS_ASSIGNED,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const evalRow = await prisma.$transaction(async (tx) => {
      return tx.approvalRoutingEvaluation.create({
        data: {
          tenantId: input.tenantId,
          recordId: input.recordId,
          triggeredByEvent: input.triggerEvent,
          triggeredByUserId,
          outcome: ApprovalRoutingOutcome.ERROR,
          matchedRuleId: matchedRule?.id ?? null,
          rulesEvaluated: truncateForJson(ruleSnapshots, RULES_SNAPSHOT_CAP) as unknown as Prisma.InputJsonValue,
          approversAssigned: [] as unknown as Prisma.InputJsonValue,
          evaluationDurationMs: duration(),
          errorMessage: message.slice(0, 500),
        },
        select: { id: true },
      });
    });
    return { skipped: false, evaluationId: evalRow.id, outcome: ApprovalRoutingOutcome.ERROR };
  }
}
