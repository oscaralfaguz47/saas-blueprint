import "server-only";

import type { Prisma } from "@prisma/client";
import { ApproverTargetType, ApprovalEscalationPolicy } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { resolveTenantPlan } from "@/server/billing/resolve-tenant-plan";
import type { PlanFeatures } from "@/server/billing/provider-types";
import { apiError, ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import {
  parseBody,
  approvalRoutingRuleCreateSchema,
  approvalRoutingRuleListQuerySchema,
  evaluateApprovalRoutingPlanGate,
  approvalRoutingRuleApproverSchema,
} from "@/lib/validations";
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

function decodeCursor(cursor: string): { priority: number; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as { priority?: number; id?: string };
    return typeof parsed?.priority === "number" && parsed?.id
      ? (parsed as { priority: number; id: string })
      : null;
  } catch {
    return null;
  }
}

function encodeCursor(priority: number, id: string): string {
  return Buffer.from(JSON.stringify({ priority, id }), "utf8").toString("base64url");
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

function parseListQuery(req: Request) {
  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  return approvalRoutingRuleListQuerySchema.parse({
    limit: raw.limit,
    cursor: raw.cursor || undefined,
    status: raw.status || undefined,
    includeArchived: raw.includeArchived,
  });
}

const listSelect = {
  id: true,
  name: true,
  description: true,
  priority: true,
  mode: true,
  status: true,
  escalationPolicy: true,
  triggerOnCreate: true,
  triggerOnAmountChange: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  _count: {
    select: {
      conditions: { where: { deletedAt: null } },
      requiredApprovers: { where: { deletedAt: null } },
    },
  },
} as const;

function mapListRow(
  r: Prisma.ApprovalRoutingRuleGetPayload<{ select: typeof listSelect }>
) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    priority: r.priority,
    mode: r.mode,
    status: r.status,
    escalationPolicy: r.escalationPolicy,
    triggerOnCreate: r.triggerOnCreate,
    triggerOnAmountChange: r.triggerOnAmountChange,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
    conditionCount: r._count.conditions,
    approverCount: r._count.requiredApprovers,
  };
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

/**
 * POST plan gate: enabled → maxRules (count) → SEQUENTIAL → escalation ≠ NONE → CUSTOM_FIELD.
 */
function assertApprovalRoutingPlanAllows(params: {
  features: PlanFeatures;
  currentRuleCount: number;
  mode: import("@prisma/client").ApprovalRoutingMode;
  escalationPolicy: import("@prisma/client").ApprovalEscalationPolicy;
  conditionFields: import("@prisma/client").ConditionField[];
}): ReturnType<typeof apiError> | null {
  const gate = evaluateApprovalRoutingPlanGate(params.features.approvalRouting, {
    currentRuleCount: params.currentRuleCount,
    mode: params.mode,
    escalationPolicy: params.escalationPolicy,
    conditionFields: params.conditionFields,
  });
  return approvalRoutingPlanGateToResponse(gate);
}

/**
 * GET /api/tenant/approval-routing-rules — list (no plan gate).
 */
export const GET = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const gate = await requireApprovalRoutingManager(session.user.id);
  if (gate.error) return gate.error;
  const tenant = gate.tenant!;

  let query: z.infer<typeof approvalRoutingRuleListQuerySchema>;
  try {
    query = parseListQuery(req);
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid query parameters");
  }

  const limit = Math.min(query.limit, 50);

  const where: Prisma.ApprovalRoutingRuleWhereInput = { tenantId: tenant.id };
  if (!query.includeArchived) {
    where.deletedAt = null;
  }
  if (query.status) {
    where.status = query.status;
  }

  const cursorWhere = (() => {
    if (!query.cursor) return {};
    const decoded = decodeCursor(query.cursor);
    if (!decoded) return {};
    return {
      OR: [
        { priority: { gt: decoded.priority } },
        { AND: [{ priority: decoded.priority }, { id: { gt: decoded.id } }] },
      ],
    };
  })();

  const fullWhere =
    Object.keys(cursorWhere).length > 0 ? { AND: [where, cursorWhere] } : where;

  const rows = await prisma.approvalRoutingRule.findMany({
    where: fullWhere,
    orderBy: [{ priority: "asc" }, { id: "asc" }],
    take: limit + 1,
    select: listSelect,
  });

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice[slice.length - 1];
  let nextCursor: string | null = null;
  if (hasMore && last) {
    nextCursor = encodeCursor(last.priority, last.id);
  }

  return apiSuccess({
    items: slice.map(mapListRow),
    nextCursor,
  });
});

/**
 * POST /api/tenant/approval-routing-rules — create (plan-gated).
 */
export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const gate = await requireApprovalRoutingManager(session.user.id);
  if (gate.error) return gate.error;
  const tenant = gate.tenant!;

  const plan = await resolveTenantPlan(tenant.id);
  const currentRuleCount = await prisma.approvalRoutingRule.count({
    where: { tenantId: tenant.id, deletedAt: null },
  });

  const body = await parseBody(req, approvalRoutingRuleCreateSchema);

  const planErr = assertApprovalRoutingPlanAllows({
    features: plan.features,
    currentRuleCount,
    mode: body.mode,
    escalationPolicy: body.escalationPolicy,
    conditionFields: body.conditions.map((c) => c.field),
  });
  if (planErr) return planErr;

  if (body.escalationTargetMembershipId) {
    const m = await prisma.tenantMembership.findFirst({
      where: {
        id: body.escalationTargetMembershipId,
        tenantId: tenant.id,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!m) {
      return ApiErrors.VALIDATION_ERROR("Escalation target membership not found or not active.");
    }
  }

  const approverErr = await validateApproverReferences(tenant.id, body.requiredApprovers);
  if (approverErr) return approverErr;

  const dup = await prisma.approvalRoutingRule.findFirst({
    where: {
      tenantId: tenant.id,
      name: { equals: body.name, mode: "insensitive" },
      deletedAt: null,
    },
    select: { id: true },
  });
  if (dup) {
    return ApiErrors.CONFLICT("An approval routing rule with this name already exists.", {
      code: "DUPLICATE_NAME",
    });
  }

  const actorUserId = session.user.id;
  const escHours =
    body.escalationPolicy === ApprovalEscalationPolicy.NONE
      ? null
      : (body.escalationHours ?? null);
  const escTarget =
    body.escalationPolicy === ApprovalEscalationPolicy.NONE
      ? null
      : (body.escalationTargetMembershipId ?? null);

  try {
    const created = await prisma.$transaction(async (tx) => {
      const rule = await tx.approvalRoutingRule.create({
        data: {
          tenantId: tenant.id,
          name: body.name,
          description: body.description ?? null,
          priority: body.priority,
          mode: body.mode,
          status: body.status,
          escalationPolicy: body.escalationPolicy,
          escalationHours: escHours,
          escalationTargetMembershipId: escTarget,
          triggerOnCreate: body.triggerOnCreate,
          triggerOnAmountChange: body.triggerOnAmountChange,
          createdByUserId: actorUserId,
        },
        select: {
          id: true,
          name: true,
          mode: true,
          escalationPolicy: true,
        },
      });

      await tx.approvalRoutingRuleCondition.createMany({
        data: body.conditions.map((c) => ({
          tenantId: tenant.id,
          ruleId: rule.id,
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

      await tx.approvalRoutingRuleApprover.createMany({
        data: body.requiredApprovers.map((a) =>
          approverCreateRow(tenant.id, rule.id, a)
        ),
      });

      await tx.auditLog.create({
        data: {
          actorUserId,
          actorContext: "TENANT",
          tenantId: tenant.id,
          action: "tenant.approval_routing_rule.created",
          targetType: "ApprovalRoutingRule",
          targetId: rule.id,
          metadata: {
            ruleId: rule.id,
            name: rule.name,
            mode: rule.mode,
            escalationPolicy: rule.escalationPolicy,
            conditionCount: body.conditions.length,
            approverCount: body.requiredApprovers.length,
          },
        },
      });

      const full = await tx.approvalRoutingRule.findFirst({
        where: { id: rule.id, tenantId: tenant.id },
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
          conditions: {
            where: { deletedAt: null },
            orderBy: { id: "asc" },
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
            orderBy: [{ sequenceOrder: "asc" }, { id: "asc" }],
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
        },
      });
      return full;
    });

    return apiSuccess(created, 201);
  } catch (e) {
    if (e instanceof PrismaClientKnownRequestError && e.code === "P2002") {
      return ApiErrors.CONFLICT("An approval routing rule with this name already exists.", {
        code: "DUPLICATE_NAME",
      });
    }
    throw e;
  }
});
