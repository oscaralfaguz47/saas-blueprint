import "server-only";

import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, financeTeamPatchSchema } from "@/lib/validations";

const paramsSchema = z.object({ teamId: z.string().cuid() });

type TeamAxisSnapshot = {
  name: string;
  description: string | null;
  departmentId: string | null;
  isActive: boolean;
  timeZone: string | null;
  maxConcurrentAssignments: number | null;
};

function snapshotFromRow(r: TeamAxisSnapshot): TeamAxisSnapshot {
  return {
    name: r.name,
    description: r.description,
    departmentId: r.departmentId,
    isActive: r.isActive,
    timeZone: r.timeZone,
    maxConcurrentAssignments: r.maxConcurrentAssignments,
  };
}

function mapDetail(r: {
  id: string;
  name: string;
  description: string | null;
  departmentId: string | null;
  isActive: boolean;
  timeZone: string | null;
  maxConcurrentAssignments: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  _count: { members: number };
}) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    departmentId: r.departmentId,
    isActive: r.isActive,
    timeZone: r.timeZone,
    maxConcurrentAssignments: r.maxConcurrentAssignments,
    memberCount: r._count.members,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
  };
}

async function requireFinanceTeamManager(sessionUserId: string) {
  const user = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: { isPlatformBlocked: true },
  });
  if (!user) return { error: ApiErrors.UNAUTHENTICATED(), tenant: null };
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

/**
 * GET /api/tenant/finance-teams/[teamId]
 */
export const GET = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ teamId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const paramsResult = paramsSchema.safeParse(await context.params);
  if (!paramsResult.success) return ApiErrors.VALIDATION_ERROR("Invalid team id");

  const gate = await requireFinanceTeamManager(session.user.id);
  if (gate.error) return gate.error;
  const tenant = gate.tenant;

  const team = await prisma.financeTeam.findFirst({
    where: { id: paramsResult.data.teamId, tenantId: tenant.id, deletedAt: null },
    select: {
      id: true,
      name: true,
      description: true,
      departmentId: true,
      isActive: true,
      timeZone: true,
      maxConcurrentAssignments: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      _count: {
        select: {
          members: { where: { deletedAt: null } },
        },
      },
    },
  });
  if (!team) return ApiErrors.NOT_FOUND("Finance team");

  return apiSuccess(mapDetail(team));
});

/**
 * PATCH /api/tenant/finance-teams/[teamId]
 */
export const PATCH = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ teamId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const paramsResult = paramsSchema.safeParse(await context.params);
  if (!paramsResult.success) return ApiErrors.VALIDATION_ERROR("Invalid team id");
  const { teamId } = paramsResult.data;

  const gate = await requireFinanceTeamManager(session.user.id);
  if (gate.error) return gate.error;
  const tenant = gate.tenant;

  const body = await parseBody(req, financeTeamPatchSchema);

  const existing = await prisma.financeTeam.findFirst({
    where: { id: teamId, tenantId: tenant.id, deletedAt: null },
    select: {
      id: true,
      name: true,
      description: true,
      departmentId: true,
      isActive: true,
      timeZone: true,
      maxConcurrentAssignments: true,
    },
  });
  if (!existing) return ApiErrors.NOT_FOUND("Finance team");

  if (body.departmentId !== undefined) {
    const dept = await prisma.tenantDepartment.findFirst({
      where: { id: body.departmentId, tenantId: tenant.id },
      select: { id: true },
    });
    if (!dept) return ApiErrors.NOT_FOUND("Department");
  }

  if (body.name !== undefined) {
    const dup = await prisma.financeTeam.findFirst({
      where: {
        tenantId: tenant.id,
        name: { equals: body.name, mode: "insensitive" },
        id: { not: teamId },
      },
      select: { id: true },
    });
    if (dup) {
      return ApiErrors.CONFLICT("A finance team with this name already exists.");
    }
  }

  const before = snapshotFromRow(existing);

  const data: Prisma.FinanceTeamUncheckedUpdateInput = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.description !== undefined) data.description = body.description ?? null;
  if (body.departmentId !== undefined) data.departmentId = body.departmentId ?? null;
  if (body.isActive !== undefined) data.isActive = body.isActive;
  if (body.timeZone !== undefined) data.timeZone = body.timeZone ?? null;
  if (body.maxConcurrentAssignments !== undefined) {
    data.maxConcurrentAssignments = body.maxConcurrentAssignments ?? null;
  }

  const fieldsChanged: string[] = [];
  if (body.name !== undefined && body.name !== existing.name) fieldsChanged.push("name");
  if (body.description !== undefined && (body.description ?? null) !== (existing.description ?? null)) {
    fieldsChanged.push("description");
  }
  if (
    body.departmentId !== undefined &&
    (body.departmentId ?? null) !== (existing.departmentId ?? null)
  ) {
    fieldsChanged.push("departmentId");
  }
  if (body.isActive !== undefined && body.isActive !== existing.isActive) {
    fieldsChanged.push("isActive");
  }
  if (body.timeZone !== undefined && (body.timeZone ?? null) !== (existing.timeZone ?? null)) {
    fieldsChanged.push("timeZone");
  }
  if (
    body.maxConcurrentAssignments !== undefined &&
    (body.maxConcurrentAssignments ?? null) !== (existing.maxConcurrentAssignments ?? null)
  ) {
    fieldsChanged.push("maxConcurrentAssignments");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.financeTeam.update({
      where: { id: teamId },
      data,
      select: {
        id: true,
        name: true,
        description: true,
        departmentId: true,
        isActive: true,
        timeZone: true,
        maxConcurrentAssignments: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        _count: {
          select: {
            members: { where: { deletedAt: null } },
          },
        },
      },
    });

    const after = snapshotFromRow(row);

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId: tenant.id,
        action: "tenant.finance_team.updated",
        targetType: "FinanceTeam",
        targetId: teamId,
        metadata: {
          before,
          after,
          fieldsChanged,
        },
      },
    });

    return row;
  });

  return apiSuccess(mapDetail(updated));
});

/**
 * DELETE /api/tenant/finance-teams/[teamId] — soft delete (D-007).
 */
export const DELETE = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ teamId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const paramsResult = paramsSchema.safeParse(await context.params);
  if (!paramsResult.success) return ApiErrors.VALIDATION_ERROR("Invalid team id");
  const { teamId } = paramsResult.data;

  const gate = await requireFinanceTeamManager(session.user.id);
  if (gate.error) return gate.error;
  const tenant = gate.tenant;

  const existing = await prisma.financeTeam.findFirst({
    where: { id: teamId, tenantId: tenant.id, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!existing) return ApiErrors.NOT_FOUND("Finance team");

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.financeTeam.update({
      where: { id: teamId },
      data: {
        deletedAt: now,
        deletedByUserId: session.user.id,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId: tenant.id,
        action: "tenant.finance_team.deleted",
        targetType: "FinanceTeam",
        targetId: teamId,
        metadata: { name: existing.name },
      },
    });
  });

  return apiSuccess({ ok: true as const });
});
