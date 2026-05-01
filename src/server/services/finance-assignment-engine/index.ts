import "server-only";

import {
  ActorContext,
  DelegationScope,
  DelegationStatus,
  EvaluationOutcome,
  FinanceStatus,
  FinanceResponsibility,
  MembershipAvailability,
  MembershipStatus,
  NotificationType,
  Prisma,
  RecordEventType,
} from "@prisma/client";
import type { Record } from "@prisma/client";
import { prisma } from "@/server/db";
import { resolveTenantPlan } from "@/server/billing/resolve-tenant-plan";
import { FEATURE_FLAG_CODES, isFeatureEnabled } from "@/server/security/feature-flags";
import { createNotification } from "@/server/services/notifications";
import type { DbTx } from "@/server/services/notifications/channels/notification-channel";
import type { ConditionEvaluationResult } from "./evaluate-condition";
import { evaluateCondition } from "./evaluate-condition";
import { EXCLUSION_REASONS, type ExclusionReason } from "./exclusion-reasons";
import { STRATEGY_MAP } from "./strategies";
import type { Candidate, StrategyContext } from "./strategies";

const RULES_SNAPSHOT_CAP = 100;
const CANDIDATES_SNAPSHOT_CAP = 200;

type TruncationMarker = { _truncated: true; omittedCount: number };

function truncateForJson<T>(items: T[], cap: number): (T | TruncationMarker)[] {
  if (items.length <= cap) return items;
  return [...items.slice(0, cap), { _truncated: true, omittedCount: items.length - cap }];
}

type EvaluatedRuleSnapshot = {
  ruleId: string;
  ruleName: string;
  priority: number;
  matched: boolean;
  conditionsResult: ConditionEvaluationResult[];
};

type CandidateSnapshotRow = {
  membershipId: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  weight: number;
  currentLoad: number;
  isLead: boolean;
  excluded: boolean;
  exclusionReason: ExclusionReason | null;
  selectedAsWinner: boolean;
};

export type EvaluateAndAssignInput = {
  tenantId: string;
  recordId: string;
  triggerEvent: string;
  triggeredByUserId?: string | null;
};

export type EvaluateAndAssignResult = {
  outcome: EvaluationOutcome;
  evaluationId: string;
  assignedMembershipId?: string | null;
  matchedRuleId?: string | null;
};

function availabilityToExclusion(a: MembershipAvailability): ExclusionReason | null {
  switch (a) {
    case MembershipAvailability.AVAILABLE:
      return null;
    case MembershipAvailability.AWAY:
      return EXCLUSION_REASONS.AVAILABILITY_AWAY;
    case MembershipAvailability.OUT_OF_OFFICE:
      return EXCLUSION_REASONS.AVAILABILITY_OUT_OF_OFFICE;
    case MembershipAvailability.ON_LEAVE:
      return EXCLUSION_REASONS.AVAILABILITY_ON_LEAVE;
    case MembershipAvailability.PAUSED:
      return EXCLUSION_REASONS.AVAILABILITY_PAUSED;
    default:
      return EXCLUSION_REASONS.AVAILABILITY_AWAY;
  }
}

async function persistEvaluationOnly(
  tx: DbTx,
  args: {
    tenantId: string;
    recordId: string;
    triggerEvent: string;
    triggeredByUserId: string | null;
    outcome: EvaluationOutcome;
    matchedRuleId: string | null;
    assignedMembershipId: string | null;
    rulesEvaluated: Prisma.InputJsonValue;
    candidatesEvaluated: Prisma.InputJsonValue;
    selectionStrategy: string | null;
    evaluationDurationMs: number;
    errorMessage: string | null;
  }
): Promise<{ id: string }> {
  return tx.financeAssignmentEvaluation.create({
    data: {
      tenantId: args.tenantId,
      recordId: args.recordId,
      triggeredByEvent: args.triggerEvent,
      triggeredByUserId: args.triggeredByUserId,
      outcome: args.outcome,
      matchedRuleId: args.matchedRuleId,
      assignedMembershipId: args.assignedMembershipId,
      rulesEvaluated: args.rulesEvaluated,
      candidatesEvaluated: args.candidatesEvaluated,
      selectionStrategy: args.selectionStrategy,
      evaluationDurationMs: args.evaluationDurationMs,
      errorMessage: args.errorMessage,
    },
    select: { id: true },
  });
}

function financeEligibilityReason(m: Candidate["membership"]): ExclusionReason | null {
  if (m.status !== MembershipStatus.ACTIVE) {
    return EXCLUSION_REASONS.INACTIVE_MEMBERSHIP;
  }
  if (
    m.financeResponsibility !== FinanceResponsibility.PROCESS &&
    m.financeResponsibility !== FinanceResponsibility.PROCESS_AND_APPROVE
  ) {
    return EXCLUSION_REASONS.INSUFFICIENT_FINANCE_RESPONSIBILITY;
  }
  return availabilityToExclusion(m.availability);
}

export async function evaluateAndAssign(
  input: EvaluateAndAssignInput
): Promise<EvaluateAndAssignResult> {
  const started = Date.now();

  const record = await prisma.record.findFirst({
    where: { id: input.recordId, tenantId: input.tenantId },
  });
  if (!record) {
    throw new Error("Record not found for finance assignment evaluation");
  }

  const duration = () => Date.now() - started;
  const triggeredByUserId = input.triggeredByUserId ?? null;

  // --- Idempotency FIRST (before plan / feature flag) ---
  if (record.financeAssignedMembershipId) {
    const evalRow = await prisma.$transaction(async (tx) => {
      return persistEvaluationOnly(tx, {
        tenantId: input.tenantId,
        recordId: input.recordId,
        triggerEvent: input.triggerEvent,
        triggeredByUserId,
        outcome: EvaluationOutcome.ASSIGNED,
        matchedRuleId: null,
        assignedMembershipId: record.financeAssignedMembershipId,
        rulesEvaluated: [],
        candidatesEvaluated: [],
        selectionStrategy: "IDEMPOTENT_REPLAY",
        evaluationDurationMs: duration(),
        errorMessage: null,
      });
    });
    return {
      outcome: EvaluationOutcome.ASSIGNED,
      evaluationId: evalRow.id,
      assignedMembershipId: record.financeAssignedMembershipId,
      matchedRuleId: null,
    };
  }

  const plan = await resolveTenantPlan(input.tenantId);
  if (!plan.features.assignmentEngine) {
    const evalRow = await prisma.$transaction(async (tx) => {
      return persistEvaluationOnly(tx, {
        tenantId: input.tenantId,
        recordId: input.recordId,
        triggerEvent: input.triggerEvent,
        triggeredByUserId,
        outcome: EvaluationOutcome.PLAN_NOT_ENTITLED,
        matchedRuleId: null,
        assignedMembershipId: null,
        rulesEvaluated: truncateForJson([], RULES_SNAPSHOT_CAP) as unknown as Prisma.InputJsonValue,
        candidatesEvaluated: truncateForJson([], CANDIDATES_SNAPSHOT_CAP) as unknown as Prisma.InputJsonValue,
        selectionStrategy: null,
        evaluationDurationMs: duration(),
        errorMessage: null,
      });
    });
    return {
      outcome: EvaluationOutcome.PLAN_NOT_ENTITLED,
      evaluationId: evalRow.id,
    };
  }

  const engineOn = await isFeatureEnabled(
    FEATURE_FLAG_CODES.ASSIGNMENT_ENGINE_ENABLED,
    input.tenantId
  );
  if (!engineOn) {
    const evalRow = await prisma.$transaction(async (tx) => {
      return persistEvaluationOnly(tx, {
        tenantId: input.tenantId,
        recordId: input.recordId,
        triggerEvent: input.triggerEvent,
        triggeredByUserId,
        outcome: EvaluationOutcome.ENGINE_DISABLED,
        matchedRuleId: null,
        assignedMembershipId: null,
        rulesEvaluated: truncateForJson([], RULES_SNAPSHOT_CAP) as unknown as Prisma.InputJsonValue,
        candidatesEvaluated: truncateForJson([], CANDIDATES_SNAPSHOT_CAP) as unknown as Prisma.InputJsonValue,
        selectionStrategy: null,
        evaluationDurationMs: duration(),
        errorMessage: null,
      });
    });
    return {
      outcome: EvaluationOutcome.ENGINE_DISABLED,
      evaluationId: evalRow.id,
    };
  }

  try {
    const rules = await prisma.financeAssignmentRule.findMany({
      where: {
        tenantId: input.tenantId,
        status: "ACTIVE",
        deletedAt: null,
      },
      orderBy: [{ priority: "asc" }, { id: "asc" }],
      include: {
        conditions: {
          where: { deletedAt: null },
          orderBy: { id: "asc" },
        },
        team: {
          select: {
            id: true,
            maxConcurrentAssignments: true,
            name: true,
          },
        },
      },
    });

    const rulesSnapshots: EvaluatedRuleSnapshot[] = [];
    let matchedRule: (typeof rules)[number] | null = null;

    for (const rule of rules) {
      const conditionsResult = rule.conditions.map((c) => evaluateCondition(c, record as Record));
      const matched = conditionsResult.every((r) => r.passed);
      rulesSnapshots.push({
        ruleId: rule.id,
        ruleName: rule.name,
        priority: rule.priority,
        matched,
        conditionsResult,
      });
      if (matched && !matchedRule) {
        matchedRule = rule;
      }
    }

    const rulesJson = truncateForJson(rulesSnapshots, RULES_SNAPSHOT_CAP) as unknown as Prisma.InputJsonValue;

    if (!matchedRule) {
      const evalRow = await prisma.$transaction(async (tx) => {
        return persistEvaluationOnly(tx, {
          tenantId: input.tenantId,
          recordId: input.recordId,
          triggerEvent: input.triggerEvent,
          triggeredByUserId,
          outcome: EvaluationOutcome.NO_RULE_MATCHED,
          matchedRuleId: null,
          assignedMembershipId: null,
          rulesEvaluated: rulesJson,
          candidatesEvaluated: truncateForJson([], CANDIDATES_SNAPSHOT_CAP) as unknown as Prisma.InputJsonValue,
          selectionStrategy: null,
          evaluationDurationMs: duration(),
          errorMessage: null,
        });
      });
      return {
        outcome: EvaluationOutcome.NO_RULE_MATCHED,
        evaluationId: evalRow.id,
      };
    }

    const members = await prisma.financeTeamMember.findMany({
      where: { tenantId: input.tenantId, teamId: matchedRule.teamId, deletedAt: null },
      include: {
        membership: {
          include: {
            user: { select: { name: true, email: true } },
          },
        },
      },
    });

    const candidates: Candidate[] = members.map((m) => ({
      ...m,
      membership: m.membership,
    }));

    const now = new Date();
    const memberIds = candidates.map((c) => c.membershipId);
    const delegatedRows =
      memberIds.length > 0
        ? await prisma.approvalDelegation.findMany({
            where: {
              tenantId: input.tenantId,
              delegatorMembershipId: { in: memberIds },
              status: DelegationStatus.ACTIVE,
              startsAt: { lte: now },
              endsAt: { gte: now },
              revokedAt: null,
              scope: { in: [DelegationScope.FINANCE_ONLY, DelegationScope.ALL] },
            },
            select: { delegatorMembershipId: true },
          })
        : [];
    const delegatedSet = new Set(delegatedRows.map((d) => d.delegatorMembershipId));

    const teamCap = matchedRule.team.maxConcurrentAssignments;

    const candidateRows: CandidateSnapshotRow[] = [];
    const eligible: Candidate[] = [];

    for (const c of candidates) {
      let excluded = false;
      let exclusionReason: ExclusionReason | null = null;

      const elig = financeEligibilityReason(c.membership);
      if (elig) {
        excluded = true;
        exclusionReason = elig;
      } else if (delegatedSet.has(c.membershipId)) {
        excluded = true;
        exclusionReason = EXCLUSION_REASONS.DELEGATED_OUT;
      } else if (
        teamCap != null &&
        c.membership.financeOpenAssignmentsCount >= teamCap
      ) {
        excluded = true;
        exclusionReason = EXCLUSION_REASONS.WORKLOAD_CAP_REACHED;
      }

      candidateRows.push({
        membershipId: c.membershipId,
        userId: c.membership.userId,
        userName: c.membership.user?.name ?? null,
        userEmail: c.membership.user?.email ?? null,
        weight: c.weight,
        currentLoad: c.membership.financeOpenAssignmentsCount,
        isLead: c.isLead,
        excluded,
        exclusionReason: excluded ? exclusionReason : null,
        selectedAsWinner: false,
      });

      if (!excluded) {
        eligible.push(c);
      }
    }

    const lastForTeam = await prisma.record.findFirst({
      where: {
        tenantId: input.tenantId,
        id: { not: input.recordId },
        financeAssignedAt: { not: null },
        financeAssignedMembershipId: { not: null },
        financeAssignedByRule: { teamId: matchedRule.teamId },
      },
      orderBy: { financeAssignedAt: "desc" },
      select: { financeAssignedMembershipId: true, financeAssignedAt: true },
    });

    const recentAssignmentsForTeam =
      lastForTeam?.financeAssignedMembershipId && lastForTeam.financeAssignedAt
        ? [
            {
              assignedMembershipId: lastForTeam.financeAssignedMembershipId,
              triggeredAt: lastForTeam.financeAssignedAt.getTime(),
            },
          ]
        : [];

    const strategyContext: StrategyContext = {
      ruleId: matchedRule.id,
      teamId: matchedRule.teamId,
      tenantId: input.tenantId,
      specificMembershipId: matchedRule.specificMembershipId,
      maxConcurrentAssignments: matchedRule.team.maxConcurrentAssignments,
      recentAssignmentsForTeam,
    };

    const strategyFn = STRATEGY_MAP[matchedRule.strategy];
    const selection = strategyFn(eligible, strategyContext);

    if (!selection.winner) {
      const candsJson = truncateForJson(
        candidateRows,
        CANDIDATES_SNAPSHOT_CAP
      ) as unknown as Prisma.InputJsonValue;
      const evalRow = await prisma.$transaction(async (tx) => {
        return persistEvaluationOnly(tx, {
          tenantId: input.tenantId,
          recordId: input.recordId,
          triggerEvent: input.triggerEvent,
          triggeredByUserId,
          outcome: EvaluationOutcome.NO_CANDIDATES_AVAILABLE,
          matchedRuleId: matchedRule!.id,
          assignedMembershipId: null,
          rulesEvaluated: rulesJson,
          candidatesEvaluated: candsJson,
          selectionStrategy: matchedRule!.strategy,
          evaluationDurationMs: duration(),
          errorMessage: null,
        });
      });
      return {
        outcome: EvaluationOutcome.NO_CANDIDATES_AVAILABLE,
        evaluationId: evalRow.id,
        matchedRuleId: matchedRule.id,
      };
    }

    const winner = selection.winner;
    for (const row of candidateRows) {
      if (row.membershipId === winner.membershipId) {
        row.selectedAsWinner = true;
        break;
      }
    }

    const candsJsonAssigned = truncateForJson(
      candidateRows,
      CANDIDATES_SNAPSHOT_CAP
    ) as unknown as Prisma.InputJsonValue;

    const auditActorUserId = triggeredByUserId ?? record.createdByUserId;
    if (!auditActorUserId) {
      throw new Error("Cannot assign finance record: missing actor for audit log");
    }

    const evalRow = await prisma.$transaction(async (tx) => {
      await tx.record.update({
        where: { id: input.recordId, tenantId: input.tenantId },
        data: {
          financeAssignedMembershipId: winner.membershipId,
          financeStatus: FinanceStatus.ASSIGNED,
          financeAssignedAt: new Date(),
          financeAssignedByRuleId: matchedRule!.id,
        },
      });

      await tx.tenantMembership.update({
        where: { id: winner.membershipId, tenantId: input.tenantId },
        data: { financeOpenAssignmentsCount: { increment: 1 } },
      });

      const evaluation = await persistEvaluationOnly(tx, {
        tenantId: input.tenantId,
        recordId: input.recordId,
        triggerEvent: input.triggerEvent,
        triggeredByUserId,
        outcome: EvaluationOutcome.ASSIGNED,
        matchedRuleId: matchedRule!.id,
        assignedMembershipId: winner.membershipId,
        rulesEvaluated: rulesJson,
        candidatesEvaluated: candsJsonAssigned,
        selectionStrategy: matchedRule!.strategy,
        evaluationDurationMs: duration(),
        errorMessage: null,
      });

      await tx.recordEvent.create({
        data: {
          tenantId: input.tenantId,
          recordId: input.recordId,
          eventType: RecordEventType.FINANCE_ASSIGNED,
          actorUserId: triggeredByUserId,
          metadata: {
            ruleId: matchedRule!.id,
            membershipId: winner.membershipId,
            strategy: matchedRule!.strategy,
            evaluationId: evaluation.id,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: auditActorUserId,
          actorContext: ActorContext.TENANT,
          tenantId: input.tenantId,
          action: "record.finance.assigned",
          targetType: "Record",
          targetId: input.recordId,
          metadata: {
            triggeredBy: triggeredByUserId,
            assignedTo: winner.membership.userId,
            ruleId: matchedRule!.id,
            membershipId: winner.membershipId,
            strategy: matchedRule!.strategy,
            evaluationId: evaluation.id,
          },
        },
      });

      try {
        await createNotification({
          userId: winner.membership.userId,
          type: NotificationType.RECORD_FINANCE_ASSIGNED,
          title: `New record assigned: ${record.title}`,
          entityType: "Record",
          entityId: input.recordId,
          actionUrl: `/app/queue/${input.recordId}`,
          tx,
        });
      } catch (notifyErr) {
        console.error("[finance-assignment-engine] createNotification failed", {
          recordId: input.recordId,
          tenantId: input.tenantId,
          error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
        });
      }

      // TODO C7-WEBHOOK-001: enqueue webhook `record.finance.assigned` (doc 05) after successful assignment.

      return evaluation;
    });

    return {
      outcome: EvaluationOutcome.ASSIGNED,
      evaluationId: evalRow.id,
      assignedMembershipId: winner.membershipId,
      matchedRuleId: matchedRule.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const evalRow = await prisma.$transaction(async (tx) => {
      return persistEvaluationOnly(tx, {
        tenantId: input.tenantId,
        recordId: input.recordId,
        triggerEvent: input.triggerEvent,
        triggeredByUserId,
        outcome: EvaluationOutcome.ERROR,
        matchedRuleId: null,
        assignedMembershipId: null,
        rulesEvaluated: truncateForJson([], RULES_SNAPSHOT_CAP) as unknown as Prisma.InputJsonValue,
        candidatesEvaluated: truncateForJson([], CANDIDATES_SNAPSHOT_CAP) as unknown as Prisma.InputJsonValue,
        selectionStrategy: null,
        evaluationDurationMs: duration(),
        errorMessage: message.slice(0, 500),
      });
    });
    return {
      outcome: EvaluationOutcome.ERROR,
      evaluationId: evalRow.id,
    };
  }
}
