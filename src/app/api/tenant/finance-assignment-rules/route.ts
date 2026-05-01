import "server-only";

import type { Prisma } from "@prisma/client";
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
import {
  parseBody,
  financeAssignmentRuleCreateSchema,
  financeAssignmentRuleListQuerySchema,
} from "@/lib/validations";

function decodeCursor(cursor: string): { priority: number; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as { priority?: number; id?: string };
    return typeof parsed?.priority === "number" && parsed?.id ? parsed as { priority: number; id: string } : null;
  } catch {
    return null;
  }
}

function encodeCursor(priority: number, id: string): string {
  return Buffer.from(JSON.stringify({ priority, id }), "utf8").toString("base64url");
}

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

function parseListQuery(req: Request) {
  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  return financeAssignmentRuleListQuerySchema.parse({
    limit: raw.limit,
    cursor: raw.cursor || undefined,
    status: raw.status || undefined,
    teamId: raw.teamId || undefined,
    includeArchived: raw.includeArchived,
  });
}

const listSelect = {
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
  _count: {
    select: {
      conditions: { where: { deletedAt: null } },
    },
  },
} as const;

function mapListRow(r: Prisma.FinanceAssignmentRuleGetPayload<{ select: typeof listSelect }>) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    priority: r.priority,
    teamId: r.teamId,
    strategy: r.strategy,
    specificMembershipId: r.specificMembershipId,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
    conditionCount: r._count.conditions,
  };
}

/**
 * GET /api/tenant/finance-assignment-rules — list (no plan gate).
 */
export const GET = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const gate = await requireFinanceAssignmentManager(session.user.id);
  if (gate.error) return gate.error;
  const tenant = gate.tenant!;

  let query: z.infer<typeof financeAssignmentRuleListQuerySchema>;
  try {
    query = parseListQuery(req);
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid query parameters");
  }

  const limit = Math.min(query.limit, 50);

  const where: Prisma.FinanceAssignmentRuleWhereInput = { tenantId: tenant.id };
  if (!query.includeArchived) {
    where.deletedAt = null;
  }
  if (query.status) {
    where.status = query.status;
  }
  if (query.teamId) {
    where.teamId = query.teamId;
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

  const rows = await prisma.financeAssignmentRule.findMany({
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
 * POST /api/tenant/finance-assignment-rules — create rule + conditions (Enterprise plan gate).
 */
export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const gate = await requireFinanceAssignmentManager(session.user.id);
  if (gate.error) return gate.error;
  const tenant = gate.tenant!;

  const plan = await resolveTenantPlan(tenant.id);
  if (!plan.features.assignmentEngine) {
    return ApiErrors.UPGRADE_REQUIRED(
      "Finance Assignment Engine requires an Enterprise plan."
    );
  }

  const body = await parseBody(req, financeAssignmentRuleCreateSchema);

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

  if (body.strategy === AssignmentStrategy.SPECIFIC_MEMBER) {
    const m = await prisma.tenantMembership.findFirst({
      where: { id: body.specificMembershipId!, tenantId: tenant.id, status: "ACTIVE" },
      select: { id: true },
    });
    if (!m) {
      return ApiErrors.VALIDATION_ERROR("Membership not found or not active.");
    }
  }

  const dup = await prisma.financeAssignmentRule.findFirst({
    where: {
      tenantId: tenant.id,
      name: { equals: body.name, mode: "insensitive" },
      deletedAt: null,
    },
    select: { id: true },
  });
  if (dup) {
    return ApiErrors.CONFLICT("An assignment rule with this name already exists.");
  }

  const actorUserId = session.user.id;
  const specificId =
    body.strategy === AssignmentStrategy.SPECIFIC_MEMBER ? body.specificMembershipId! : null;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const rule = await tx.financeAssignmentRule.create({
        data: {
          tenantId: tenant.id,
          name: body.name,
          description: body.description ?? null,
          priority: body.priority,
          teamId: body.teamId,
          strategy: body.strategy,
          specificMembershipId: specificId,
          status: body.status,
          createdByUserId: actorUserId,
        },
        select: { id: true, name: true, teamId: true, strategy: true },
      });

      if (body.conditions.length > 0) {
        await tx.financeAssignmentRuleCondition.createMany({
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
      }

      await tx.auditLog.create({
        data: {
          actorUserId,
          actorContext: "TENANT",
          tenantId: tenant.id,
          action: "tenant.assignment_rule.created",
          targetType: "FinanceAssignmentRule",
          targetId: rule.id,
          metadata: {
            ruleId: rule.id,
            name: rule.name,
            teamId: rule.teamId,
            strategy: rule.strategy,
            conditionCount: body.conditions.length,
          },
        },
      });

      const full = await tx.financeAssignmentRule.findFirst({
        where: { id: rule.id, tenantId: tenant.id },
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
        },
      });
      return full;
    });

    return apiSuccess(created, 201);
  } catch (e) {
    if (e instanceof PrismaClientKnownRequestError && e.code === "P2002") {
      return ApiErrors.CONFLICT("An assignment rule with this name already exists.");
    }
    throw e;
  }
});
