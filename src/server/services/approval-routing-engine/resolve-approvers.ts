import "server-only";

import type {
  ApprovalRoutingRuleApprover,
  Prisma,
} from "@prisma/client";
import type { DbTx } from "@/server/services/record-approval-status";

export type ResolvedApproverRow = {
  userId: string;
  sequenceOrder: number;
  routingApproverId: string;
};

export type DiscardedApproverRow = ResolvedApproverRow & {
  reason: "DUPLICATE_USER_LOWER_STEP_KEPT";
};

/**
 * C13a always materializes every resolved user as an approver ("all" semantic per step).
 * Pick-one when `requireAll: false` is deferred to F-phase. Supporting the same internal user
 * in multiple sequential steps without dedup would conflict with `@@unique([recordId, userId, participantRole])`;
 * F-phase may introduce explicit policy/constraint for that case.
 */
export async function resolveApproversForRule(
  db: DbTx,
  tenantId: string,
  approvers: ApprovalRoutingRuleApprover[],
  opts: { parallelRule: boolean }
): Promise<{
  resolvedAttempts: Prisma.InputJsonValue;
  kept: ResolvedApproverRow[];
  discarded: DiscardedApproverRow[];
}> {
  const attempts: unknown[] = [];
  const raw: ResolvedApproverRow[] = [];

  const ordered = [...approvers].sort((a, b) => {
    const d = a.sequenceOrder - b.sequenceOrder;
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });

  for (const a of ordered) {
    const sequenceOrder = opts.parallelRule ? 1 : a.sequenceOrder;
    const expanded = await expandApproverRow(db, tenantId, a, sequenceOrder);
    attempts.push({
      approverId: a.id,
      targetType: a.targetType,
      sequenceOrder,
      resolvedCount: expanded.length,
    });
    raw.push(...expanded);
  }

  raw.sort((x, y) => {
    const d = x.sequenceOrder - y.sequenceOrder;
    if (d !== 0) return d;
    return x.routingApproverId.localeCompare(y.routingApproverId);
  });

  const kept: ResolvedApproverRow[] = [];
  const discarded: DiscardedApproverRow[] = [];
  const seenUser = new Set<string>();
  for (const row of raw) {
    if (seenUser.has(row.userId)) {
      discarded.push({
        ...row,
        reason: "DUPLICATE_USER_LOWER_STEP_KEPT",
      });
    } else {
      seenUser.add(row.userId);
      kept.push(row);
    }
  }

  return {
    resolvedAttempts: attempts as unknown as Prisma.InputJsonValue,
    kept,
    discarded,
  };
}

async function expandApproverRow(
  db: DbTx,
  tenantId: string,
  a: ApprovalRoutingRuleApprover,
  sequenceOrder: number
): Promise<ResolvedApproverRow[]> {
  switch (a.targetType) {
    case "SPECIFIC_USER": {
      if (!a.targetMembershipId) return [];
      const m = await db.tenantMembership.findFirst({
        where: { id: a.targetMembershipId, tenantId, status: "ACTIVE" },
        select: { userId: true },
      });
      if (!m) return [];
      return [{ userId: m.userId, sequenceOrder, routingApproverId: a.id }];
    }
    case "ROLE": {
      if (a.targetWorkspaceRole == null) return [];
      const where: Prisma.TenantMembershipWhereInput = {
        tenantId,
        status: "ACTIVE",
        workspaceRole: a.targetWorkspaceRole,
      };
      if (a.targetFinanceResponsibility != null) {
        where.financeResponsibility = a.targetFinanceResponsibility;
      }
      const rows = await db.tenantMembership.findMany({
        where,
        select: { userId: true },
      });
      return rows.map((r) => ({
        userId: r.userId,
        sequenceOrder,
        routingApproverId: a.id,
      }));
    }
    case "TEAM": {
      if (!a.targetTeamId) return [];
      const members = await db.financeTeamMember.findMany({
        where: {
          tenantId,
          teamId: a.targetTeamId,
          deletedAt: null,
          team: { tenantId, deletedAt: null, isActive: true },
        },
        select: { membership: { select: { userId: true, status: true } } },
      });
      const out: ResolvedApproverRow[] = [];
      for (const fm of members) {
        if (fm.membership.status !== "ACTIVE") continue;
        out.push({
          userId: fm.membership.userId,
          sequenceOrder,
          routingApproverId: a.id,
        });
      }
      return out;
    }
    case "CREATOR_MANAGER":
      return [];
    default:
      return [];
  }
}
