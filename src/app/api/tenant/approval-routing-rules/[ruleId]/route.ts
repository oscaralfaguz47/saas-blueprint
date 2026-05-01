import "server-only";

import {
  Prisma,
  type ApprovalEscalationPolicy,
  type ApprovalRoutingMode,
  type ApprovalRoutingRuleStatus,
  type ConditionField,
} from "@prisma/client";
import {
  ApproverTargetType,
  ApprovalEscalationPolicy as EscPolicy,
  ApprovalRoutingMode as RoutingMode,
  ApprovalRoutingRuleStatus as RoutingRuleStatus,
} from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { resolveTenantPlan } from "@/server/billing/resolve-tenant-plan";
import { apiError, ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import {
  parseBody,
  approvalRoutingRulePatchSchema,
  evaluateApprovalRoutingPlanGate,
  assertMergedEscalationConfig,
  approvalRoutingRuleApproverSchema,
} from "@/lib/validations";
import type { PlanFeatures } from "@/server/billing/provider-types";
import type { ApprovalRoutingPlanGateResult } from "@/lib/validations/approval-routing-rule";

function approvalRoutingPlanGateToResponse(
  r: ApprovalRoutingPlanGateResult
): ReturnType<typeof apiError> | null {
  if (r.ok) return null;
  switch (r.reason) {
    case "not_enabled":
      return apiError(
        "UPGRADE_REQUIRED",
        403,
        "Approval routing is not available on your plan."
      );
    case "limit_reached":
      return apiError("UPGRADE_REQUIRED", 403, "Plan limit reached", {
        code: "LIMIT_REACHED",
        maxRules: r.maxRules,
      });
    case "sequential":
      return apiError(
        "UPGRADE_REQUIRED",
        403,
        "Sequential approval routing requires a higher plan."
      );
    case "escalation":
      return apiError(
        "UPGRADE_REQUIRED",
        403,
        "Approval escalation requires a higher plan."
      );
    case "custom_field":
      return apiError(
        "UPGRADE_REQUIRED",
        403,
        "Custom field conditions require a higher plan."
      );
    default:
      return apiError("UPGRADE_REQUIRED", 403, "Plan does not allow this configuration.");
  }
}

const paramsSchema = z.object({ ruleId: z.string().cuid() });

const detailSelect = {
  id: true,
  name: true,
  description: true,
  priority: true,
  mode: true,
  status: true,
  escalationPolicy: true,
  escalationHours: true,
  escalationTargetMembershipId: true,
  triggerOnCreate: true,
  triggerOnAmountChange: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  conditions: {
    where: { deletedAt: null },
    orderBy: { id: Prisma.SortOrder.asc },
    select: {
      id: true,
      field: true,
      operator: true,
      valueString: true,
      valueNumber: true,
      valueJson: true,
      customFieldKey: true,
      createdAt: true,
    },
  },
  requiredApprovers: {
    where: { deletedAt: null },
    orderBy: [
      { sequenceOrder: Prisma.SortOrder.asc },
      { id: Prisma.SortOrder.asc },
    ],
    select: {
      id: true,
      sequenceOrder: true,
      targetType: true,
      targetMembershipId: true,
      targetWorkspaceRole: true,
      targetFinanceResponsibility: true,
      targetTeamId: true,
      requireAll: true,
      createdAt: true,
    },
  },
};

type RuleScalar = {
  name: string;
  description: string | null;
  priority: number;
  mode: ApprovalRoutingMode;
  status: ApprovalRoutingRuleStatus;
  escalationPolicy: ApprovalEscalationPolicy;
  escalationHours: number | null;
  escalationTargetMembershipId: string | null;
  triggerOnCreate: boolean;
  triggerOnAmountChange: boolean;
};

function snapshotRule(r: RuleScalar): RuleScalar {
  return { ...r };
}

type ApproverIn = z.infer<typeof approvalRoutingRuleApproverSchema>;

function approverCreateRow(
  tenantId: string,
  ruleId: string,
  a: ApproverIn
): Prisma.ApprovalRoutingRuleApproverCreateManyInput {
  return {
    tenantId,
    ruleId,
    sequenceOrder: a.sequenceOrder,
    targetType: a.targetType,
    requireAll: a.requireAll,
    targetMembershipId:
      a.targetType === ApproverTargetType.SPECIFIC_USER ? a.targetMembershipId : null,
    targetWorkspaceRole:
      a.targetType === ApproverTargetType.ROLE ? a.targetWorkspaceRole : null,
    targetFinanceResponsibility:
      a.targetType === ApproverTargetType.ROLE
        ? (a.targetFinanceResponsibility ?? null)
        : null,
    targetTeamId: a.targetType === ApproverTargetType.TEAM ? a.targetTeamId : null,
  };
}

async function requireApprovalRoutingManager(sessionUserId: string) {
  const user = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: { isPlatformBlocked: true },
  });
  if (!user) return { error: ApiErrors.UNAUTHENTICATED(), tenant: null as { id: string } | null };
  if (user.isPlatformBlocked) return { error: ApiErrors.FORBIDDEN(), tenant: null };

  const membership = await getDefaultTenantForUser(sessionUserId);
  const tenant = membership?.tenant;
  if (!tenant) return { error: ApiErrors.NO_TENANT(), tenant: null };

  const allowed = await hasTenantPermission({
    userId: sessionUserId,
    tenantId: tenant.id,
    permission: "tenant.approval_routing.manage",
  });
  if (!allowed) return { error: ApiErrors.FORBIDDEN(), tenant: null };

  return { error: null, tenant };
}

async function validateApproverReferences(
  tenantId: string,
  approvers: ApproverIn[]
): Promise<ReturnType<typeof ApiErrors.VALIDATION_ERROR> | null> {
  for (const a of approvers) {
    if (a.targetType === ApproverTargetType.SPECIFIC_USER) {
      const m = await prisma.tenantMembership.findFirst({
        where: {
          id: a.targetMembershipId,
          tenantId,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      if (!m) {
        return ApiErrors.VALIDATION_ERROR("Membership not found or not active.");
      }
    }
    if (a.targetType === ApproverTargetType.TEAM) {
      // Approval routing TEAM targets reference FinanceTeam (cross-domain: finance org structure).
      const team = await prisma.financeTeam.findFirst({
        where: {
          id: a.targetTeamId,
          tenantId,
          deletedAt: null,
          isActive: true,
        },
        select: { id: true },
      });
      if (!team) {
        return ApiErrors.VALIDATION_ERROR("Invalid finance team for this workspace.", {
          code: "INVALID_TEAM_REFERENCE",
        });
      }
    }
  }
  return null;
}

function sequentialOrdersUnique(orders: number[]): boolean {
  return new Set(orders).size === orders.length;
}

/**
 * PATCH plan gate on effective merged values (no rule count).
 */
function assertApprovalRoutingPlanAllowsPatch(params: {
  features: PlanFeatures;
  mode: ApprovalRoutingMode;
  escalationPolicy: ApprovalEscalationPolicy;
  conditionFields: ConditionField[];
}): ReturnType<typeof apiError> | null {
  const gate = evaluateApprovalRoutingPlanGate(params.features.approvalRouting, {
    mode: params.mode,
    escalationPolicy: params.escalationPolicy,
    conditionFields: params.conditionFields,
  });
  return approvalRoutingPlanGateToResponse(gate);
}

/**
 * GET /api/tenant/approval-routing-rules/[ruleId]
 */
export const GET = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ ruleId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const paramsResult = paramsSchema.safeParse(await context.params);
  if (!paramsResult.success) return ApiErrors.VALIDATION_ERROR("Invalid rule id");
  const { ruleId } = paramsResult.data;

  const gate = await requireApprovalRoutingManager(session.user.id);
  if (gate.error) return gate.error;
  const tenant = gate.tenant!;

  const rule = await prisma.approvalRoutingRule.findFirst({
    where: { id: ruleId, tenantId: tenant.id, deletedAt: null },
    select: detailSelect,
  });
  if (!rule) return ApiErrors.NOT_FOUND("Approval routing rule");

  return apiSuccess(rule);
});

/**
 * PATCH /api/tenant/approval-routing-rules/[ruleId]
 */
export const PATCH = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ ruleId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const paramsResult = paramsSchema.safeParse(await context.params);
  if (!paramsResult.success) return ApiErrors.VALIDATION_ERROR("Invalid rule id");
  const { ruleId } = paramsResult.data;

  const gateMgr = await requireApprovalRoutingManager(session.user.id);
  if (gateMgr.error) return gateMgr.error;
  const tenant = gateMgr.tenant!;

  const plan = await resolveTenantPlan(tenant.id);
  if (!plan.features.approvalRouting.enabled) {
    const r = evaluateApprovalRoutingPlanGate(plan.features.approvalRouting, {
      mode: RoutingMode.PARALLEL,
      escalationPolicy: EscPolicy.NONE,
      conditionFields: [],
    });
    const block = approvalRoutingPlanGateToResponse(r);
    if (block) return block;
  }

  const body = await parseBody(req, approvalRoutingRulePatchSchema);

  const existing = await prisma.approvalRoutingRule.findFirst({
    where: { id: ruleId, tenantId: tenant.id, deletedAt: null },
    select: {
      id: true,
      name: true,
      description: true,
      priority: true,
      mode: true,
      status: true,
      escalationPolicy: true,
      escalationHours: true,
      escalationTargetMembershipId: true,
      triggerOnCreate: true,
      triggerOnAmountChange: true,
    },
  });
  if (!existing) return ApiErrors.NOT_FOUND("Approval routing rule");

  const mergedMode = body.mode ?? existing.mode;
  const mergedEscalationPolicy = body.escalationPolicy ?? existing.escalationPolicy;
  const mergedEscalationHoursRaw =
    body.escalationHours !== undefined
      ? body.escalationHours
      : existing.escalationHours;
  const mergedEscalationTargetRaw =
    body.escalationTargetMembershipId !== undefined
      ? body.escalationTargetMembershipId
      : existing.escalationTargetMembershipId;
  const mergedEscalationHours =
    mergedEscalationPolicy === EscPolicy.NONE ? null : mergedEscalationHoursRaw;
  const mergedEscalationTarget =
    mergedEscalationPolicy === EscPolicy.NONE ? null : mergedEscalationTargetRaw;

  let conditionFieldsForGate: ConditionField[];
  if (body.conditions !== undefined) {
    conditionFieldsForGate = body.conditions.map((c) => c.field);
  } else {
    const condRows = await prisma.approvalRoutingRuleCondition.findMany({
      where: { ruleId, tenantId: tenant.id, deletedAt: null },
      select: { field: true },
    });
    conditionFieldsForGate = condRows.map((c) => c.field);
  }

  const planErr = assertApprovalRoutingPlanAllowsPatch({
    features: plan.features,
    mode: mergedMode,
    escalationPolicy: mergedEscalationPolicy,
    conditionFields: conditionFieldsForGate,
  });
  if (planErr) return planErr;

  const escMsg = assertMergedEscalationConfig({
    escalationPolicy: mergedEscalationPolicy,
    escalationHours: mergedEscalationHours,
    escalationTargetMembershipId: mergedEscalationTarget,
  });
  if (escMsg) {
    return ApiErrors.VALIDATION_ERROR(escMsg);
  }

  if (mergedEscalationTarget) {
    const m = await prisma.tenantMembership.findFirst({
      where: {
        id: mergedEscalationTarget,
        tenantId: tenant.id,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!m) {
      return ApiErrors.VALIDATION_ERROR("Escalation target membership not found or not active.");
    }
  }

  if (body.requiredApprovers !== undefined) {
    const apprErr = await validateApproverReferences(tenant.id, body.requiredApprovers);
    if (apprErr) return apprErr;
  }

  if (mergedMode === RoutingMode.SEQUENTIAL) {
    if (body.requiredApprovers !== undefined) {
      const orders = body.requiredApprovers.map((a) => a.sequenceOrder);
      if (!sequentialOrdersUnique(orders)) {
        return ApiErrors.VALIDATION_ERROR(
          "SEQUENTIAL mode requires unique sequenceOrder per approver",
          { path: "requiredApprovers" }
        );
      }
    } else {
      const appr = await prisma.approvalRoutingRuleApprover.findMany({
        where: { ruleId, tenantId: tenant.id, deletedAt: null },
        select: { sequenceOrder: true },
      });
      const orders = appr.map((a) => a.sequenceOrder);
      if (!sequentialOrdersUnique(orders)) {
        return ApiErrors.VALIDATION_ERROR(
          "SEQUENTIAL mode requires unique sequenceOrder per approver",
          { path: "requiredApprovers" }
        );
      }
    }
  }

  if (body.name !== undefined && body.name !== existing.name) {
    const dup = await prisma.approvalRoutingRule.findFirst({
      where: {
        tenantId: tenant.id,
        name: { equals: body.name, mode: "insensitive" },
        deletedAt: null,
        id: { not: ruleId },
      },
      select: { id: true },
    });
    if (dup) {
      return ApiErrors.CONFLICT("An approval routing rule with this name already exists.", {
        code: "DUPLICATE_NAME",
      });
    }
  }

  const before = snapshotRule({
    name: existing.name,
    description: existing.description,
    priority: existing.priority,
    mode: existing.mode,
    status: existing.status,
    escalationPolicy: existing.escalationPolicy,
    escalationHours: existing.escalationHours,
    escalationTargetMembershipId: existing.escalationTargetMembershipId,
    triggerOnCreate: existing.triggerOnCreate,
    triggerOnAmountChange: existing.triggerOnAmountChange,
  });

  const data: Prisma.ApprovalRoutingRuleUncheckedUpdateInput = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.description !== undefined) data.description = body.description ?? null;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.mode !== undefined) data.mode = body.mode;
  if (body.status !== undefined) data.status = body.status;
  if (body.triggerOnCreate !== undefined) data.triggerOnCreate = body.triggerOnCreate;
  if (body.triggerOnAmountChange !== undefined) {
    data.triggerOnAmountChange = body.triggerOnAmountChange;
  }

  const escalationTouched =
    body.escalationPolicy !== undefined ||
    body.escalationHours !== undefined ||
    body.escalationTargetMembershipId !== undefined;
  if (escalationTouched) {
    data.escalationPolicy = mergedEscalationPolicy;
    data.escalationHours =
      mergedEscalationPolicy === EscPolicy.NONE ? null : mergedEscalationHours;
    data.escalationTargetMembershipId =
      mergedEscalationPolicy === EscPolicy.NONE ? null : mergedEscalationTarget;
  }

  const fieldsChanged: string[] = [];
  if (body.name !== undefined && body.name !== existing.name) fieldsChanged.push("name");
  if (
    body.description !== undefined &&
    (body.description ?? null) !== (existing.description ?? null)
  ) {
    fieldsChanged.push("description");
  }
  if (body.priority !== undefined && body.priority !== existing.priority) {
    fieldsChanged.push("priority");
  }
  if (body.mode !== undefined && body.mode !== existing.mode) fieldsChanged.push("mode");
  if (body.status !== undefined && body.status !== existing.status) {
    fieldsChanged.push("status");
  }
  if (escalationTouched) {
    if (mergedEscalationPolicy !== existing.escalationPolicy) {
      fieldsChanged.push("escalationPolicy");
    }
    if ((mergedEscalationHours ?? null) !== (existing.escalationHours ?? null)) {
      fieldsChanged.push("escalationHours");
    }
    if (
      (mergedEscalationTarget ?? null) !==
      (existing.escalationTargetMembershipId ?? null)
    ) {
      fieldsChanged.push("escalationTargetMembershipId");
    }
  }
  if (body.triggerOnCreate !== undefined && body.triggerOnCreate !== existing.triggerOnCreate) {
    fieldsChanged.push("triggerOnCreate");
  }
  if (
    body.triggerOnAmountChange !== undefined &&
    body.triggerOnAmountChange !== existing.triggerOnAmountChange
  ) {
    fieldsChanged.push("triggerOnAmountChange");
  }
  if (body.conditions !== undefined) fieldsChanged.push("conditions");
  if (body.requiredApprovers !== undefined) fieldsChanged.push("requiredApprovers");

  const now = new Date();

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.approvalRoutingRule.update({
        where: { id: ruleId },
        data,
        select: {
          id: true,
          name: true,
          description: true,
          priority: true,
          mode: true,
          status: true,
          escalationPolicy: true,
          escalationHours: true,
          escalationTargetMembershipId: true,
          triggerOnCreate: true,
          triggerOnAmountChange: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      });

      if (body.conditions !== undefined) {
        await tx.approvalRoutingRuleCondition.updateMany({
          where: { ruleId, tenantId: tenant.id, deletedAt: null },
          data: { deletedAt: now },
        });
        if (body.conditions.length > 0) {
          await tx.approvalRoutingRuleCondition.createMany({
            data: body.conditions.map((c) => ({
              tenantId: tenant.id,
              ruleId,
              field: c.field,
              operator: c.operator,
              valueString: c.valueString ?? null,
              valueNumber: c.valueNumber !== undefined ? c.valueNumber : null,
              customFieldKey: c.customFieldKey ?? null,
              ...(c.valueJson !== undefined
                ? { valueJson: c.valueJson as Prisma.InputJsonValue }
                : {}),
            })),
          });
        }
      }

      if (body.requiredApprovers !== undefined) {
        await tx.approvalRoutingRuleApprover.updateMany({
          where: { ruleId, tenantId: tenant.id, deletedAt: null },
          data: { deletedAt: now },
        });
        await tx.approvalRoutingRuleApprover.createMany({
          data: body.requiredApprovers.map((a) =>
            approverCreateRow(tenant.id, ruleId, a)
          ),
        });
      }

      const after = snapshotRule({
        name: row.name,
        description: row.description,
        priority: row.priority,
        mode: row.mode,
        status: row.status,
        escalationPolicy: row.escalationPolicy,
        escalationHours: row.escalationHours,
        escalationTargetMembershipId: row.escalationTargetMembershipId,
        triggerOnCreate: row.triggerOnCreate,
        triggerOnAmountChange: row.triggerOnAmountChange,
      });

      await tx.auditLog.create({
        data: {
          actorUserId: session.user.id,
          actorContext: "TENANT",
          tenantId: tenant.id,
          action: "tenant.approval_routing_rule.updated",
          targetType: "ApprovalRoutingRule",
          targetId: ruleId,
          metadata: {
            ruleId,
            before,
            after,
            fieldsChanged,
          },
        },
      });

      const full = await tx.approvalRoutingRule.findFirst({
        where: { id: ruleId, tenantId: tenant.id },
        select: detailSelect,
      });
      return full;
    });

    return apiSuccess(updated);
  } catch (e) {
    if (e instanceof PrismaClientKnownRequestError && e.code === "P2002") {
      return ApiErrors.CONFLICT("An approval routing rule with this name already exists.", {
        code: "DUPLICATE_NAME",
      });
    }
    throw e;
  }
});

/**
 * DELETE — soft delete rule only (deletedAt + ARCHIVED); children unchanged.
 */
export const DELETE = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ ruleId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const paramsResult = paramsSchema.safeParse(await context.params);
  if (!paramsResult.success) return ApiErrors.VALIDATION_ERROR("Invalid rule id");
  const { ruleId } = paramsResult.data;

  const gateMgr = await requireApprovalRoutingManager(session.user.id);
  if (gateMgr.error) return gateMgr.error;
  const tenant = gateMgr.tenant!;

  const plan = await resolveTenantPlan(tenant.id);
  if (!plan.features.approvalRouting.enabled) {
    const r = evaluateApprovalRoutingPlanGate(plan.features.approvalRouting, {
      mode: RoutingMode.PARALLEL,
      escalationPolicy: EscPolicy.NONE,
      conditionFields: [],
    });
    const block = approvalRoutingPlanGateToResponse(r);
    if (block) return block;
  }

  const existing = await prisma.approvalRoutingRule.findFirst({
    where: { id: ruleId, tenantId: tenant.id, deletedAt: null },
    select: { id: true, name: true, mode: true },
  });
  if (!existing) return ApiErrors.NOT_FOUND("Approval routing rule");

  await prisma.$transaction(async (tx) => {
    await tx.approvalRoutingRule.update({
      where: { id: ruleId },
      data: { deletedAt: new Date(), status: RoutingRuleStatus.ARCHIVED },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId: tenant.id,
        action: "tenant.approval_routing_rule.deleted",
        targetType: "ApprovalRoutingRule",
        targetId: ruleId,
        metadata: {
          ruleId,
          name: existing.name,
          mode: existing.mode,
        },
      },
    });
  });

  return apiSuccess({ ok: true as const });
});
