import "server-only";

import type { AssignmentRuleStatus, Prisma } from "@prisma/client";
import { AssignmentStrategy } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { resolveTenantPlan } from "@/server/billing/resolve-tenant-plan";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, financeAssignmentRulePatchSchema } from "@/lib/validations";

const paramsSchema = z.object({ ruleId: z.string().cuid() });

const detailSelect = {
  id: true,
  name: true,
  description: true,
  priority: true,
  teamId: true,
  strategy: true,
  specificMembershipId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  conditions: {
    where: { deletedAt: null },
    orderBy: { id: "asc" as const },
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
} as const;

type RuleRow = Prisma.FinanceAssignmentRuleGetPayload<{ select: typeof detailSelect }>;

async function requireFinanceAssignmentManager(sessionUserId: string) {
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
    permission: "tenant.financial_config.manage",
  });
  if (!allowed) return { error: ApiErrors.FORBIDDEN(), tenant: null };

  return { error: null, tenant };
}

type RuleScalar = {
  name: string;
  description: string | null;
  priority: number;
  teamId: string;
  strategy: AssignmentStrategy;
  specificMembershipId: string | null;
  status: AssignmentRuleStatus;
};

function snapshotRule(r: RuleScalar): RuleScalar {
  return { ...r };
}

/**
 * GET /api/tenant/finance-assignment-rules/[ruleId] — detail (no plan gate).
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

  const gate = await requireFinanceAssignmentManager(session.user.id);
  if (gate.error) return gate.error;
  const tenant = gate.tenant!;

  const rule = await prisma.financeAssignmentRule.findFirst({
    where: { id: ruleId, tenantId: tenant.id, deletedAt: null },
    select: detailSelect,
  });
  if (!rule) return ApiErrors.NOT_FOUND("Assignment rule");

  return apiSuccess(rule);
});

/**
 * PATCH /api/tenant/finance-assignment-rules/[ruleId]
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

  const gate = await requireFinanceAssignmentManager(session.user.id);
  if (gate.error) return gate.error;
  const tenant = gate.tenant!;

  const plan = await resolveTenantPlan(tenant.id);
  if (!plan.features.assignmentEngine) {
    return ApiErrors.UPGRADE_REQUIRED(
      "Finance Assignment Engine requires an Enterprise plan."
    );
  }

  const body = await parseBody(req, financeAssignmentRulePatchSchema);

  const existing = await prisma.financeAssignmentRule.findFirst({
    where: { id: ruleId, tenantId: tenant.id, deletedAt: null },
    select: {
      id: true,
      name: true,
      description: true,
      priority: true,
      teamId: true,
      strategy: true,
      specificMembershipId: true,
      status: true,
    },
  });
  if (!existing) return ApiErrors.NOT_FOUND("Assignment rule");

  const mergedStrategy = body.strategy ?? existing.strategy;
  let mergedSpecific: string | null =
    body.specificMembershipId !== undefined
      ? body.specificMembershipId
      : existing.specificMembershipId;

  if (mergedStrategy !== AssignmentStrategy.SPECIFIC_MEMBER) {
    mergedSpecific = null;
  }

  if (mergedStrategy === AssignmentStrategy.SPECIFIC_MEMBER && !mergedSpecific) {
    return ApiErrors.VALIDATION_ERROR(
      "SPECIFIC_MEMBER strategy requires specificMembershipId",
      { path: "specificMembershipId" }
    );
  }

  if (body.teamId !== undefined) {
    const team = await prisma.financeTeam.findFirst({
      where: {
        id: body.teamId,
        tenantId: tenant.id,
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

  if (mergedStrategy === AssignmentStrategy.SPECIFIC_MEMBER && mergedSpecific) {
    const m = await prisma.tenantMembership.findFirst({
      where: { id: mergedSpecific, tenantId: tenant.id, status: "ACTIVE" },
      select: { id: true },
    });
    if (!m) {
      return ApiErrors.VALIDATION_ERROR("Membership not found or not active.");
    }
  }

  if (body.name !== undefined && body.name !== existing.name) {
    const dup = await prisma.financeAssignmentRule.findFirst({
      where: {
        tenantId: tenant.id,
        name: { equals: body.name, mode: "insensitive" },
        deletedAt: null,
        id: { not: ruleId },
      },
      select: { id: true },
    });
    if (dup) {
      return ApiErrors.CONFLICT("An assignment rule with this name already exists.");
    }
  }

  const before = snapshotRule(existing);

  const data: Prisma.FinanceAssignmentRuleUncheckedUpdateInput = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.description !== undefined) data.description = body.description ?? null;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.teamId !== undefined) data.teamId = body.teamId;
  if (body.strategy !== undefined) data.strategy = body.strategy;
  if (body.status !== undefined) data.status = body.status;
  data.specificMembershipId = mergedSpecific;

  const fieldsChanged: string[] = [];
  if (body.name !== undefined && body.name !== existing.name) fieldsChanged.push("name");
  if (body.description !== undefined && (body.description ?? null) !== (existing.description ?? null)) {
    fieldsChanged.push("description");
  }
  if (body.priority !== undefined && body.priority !== existing.priority) fieldsChanged.push("priority");
  if (body.teamId !== undefined && body.teamId !== existing.teamId) fieldsChanged.push("teamId");
  if (body.strategy !== undefined && body.strategy !== existing.strategy) fieldsChanged.push("strategy");
  if (body.status !== undefined && body.status !== existing.status) fieldsChanged.push("status");
  const specBefore = existing.specificMembershipId ?? null;
  if (specBefore !== mergedSpecific) fieldsChanged.push("specificMembershipId");

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.financeAssignmentRule.update({
        where: { id: ruleId },
        data,
        select: {
          id: true,
          name: true,
          description: true,
          priority: true,
          teamId: true,
          strategy: true,
          specificMembershipId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      });

      const after = snapshotRule(row);

      await tx.auditLog.create({
        data: {
          actorUserId: session.user.id,
          actorContext: "TENANT",
          tenantId: tenant.id,
          action: "tenant.assignment_rule.updated",
          targetType: "FinanceAssignmentRule",
          targetId: ruleId,
          metadata: {
            ruleId,
            before,
            after,
            fieldsChanged,
          },
        },
      });

      return row;
    });

    return apiSuccess(updated);
  } catch (e) {
    if (e instanceof PrismaClientKnownRequestError && e.code === "P2002") {
      return ApiErrors.CONFLICT("An assignment rule with this name already exists.");
    }
    throw e;
  }
});

/**
 * DELETE — soft delete (deletedAt only).
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

  const gate = await requireFinanceAssignmentManager(session.user.id);
  if (gate.error) return gate.error;
  const tenant = gate.tenant!;

  const plan = await resolveTenantPlan(tenant.id);
  if (!plan.features.assignmentEngine) {
    return ApiErrors.UPGRADE_REQUIRED(
      "Finance Assignment Engine requires an Enterprise plan."
    );
  }

  const existing = await prisma.financeAssignmentRule.findFirst({
    where: { id: ruleId, tenantId: tenant.id, deletedAt: null },
    select: { id: true, name: true, teamId: true },
  });
  if (!existing) return ApiErrors.NOT_FOUND("Assignment rule");

  await prisma.$transaction(async (tx) => {
    await tx.financeAssignmentRule.update({
      where: { id: ruleId },
      data: { deletedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId: tenant.id,
        action: "tenant.assignment_rule.deleted",
        targetType: "FinanceAssignmentRule",
        targetId: ruleId,
        metadata: {
          ruleId,
          name: existing.name,
          teamId: existing.teamId,
        },
      },
    });
  });

  return apiSuccess({ ok: true as const });
});
