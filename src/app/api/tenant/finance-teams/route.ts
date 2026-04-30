import "server-only";

import type { Prisma } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, financeTeamCreateSchema, financeTeamListQuerySchema } from "@/lib/validations";

function decodeCursor(cursor: string): { id: string; sortValue: string } | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as { id: string; sortValue: string };
    return parsed?.id && parsed?.sortValue ? parsed : null;
  } catch {
    return null;
  }
}

function encodeCursor(id: string, sortValue: string): string {
  return Buffer.from(JSON.stringify({ id, sortValue }), "utf8").toString("base64url");
}

function parseListQuery(req: Request) {
  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  return financeTeamListQuerySchema.parse({
    limit: raw.limit,
    cursor: raw.cursor || undefined,
    search: raw.search || undefined,
    departmentId: raw.departmentId || undefined,
    includeArchived: raw.includeArchived,
    sortDir: raw.sortDir,
  });
}

function mapTeamRow(r: {
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

/**
 * GET /api/tenant/finance-teams — cursor-paginated list (tenant.financial_config.manage).
 */
export const GET = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isPlatformBlocked: true },
  });
  if (!user) return ApiErrors.UNAUTHENTICATED();
  if (user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  const membership = await getDefaultTenantForUser(session.user.id);
  const tenant = membership?.tenant;
  if (!tenant) return ApiErrors.NO_TENANT();
  const tenantId = tenant.id;

  const allowed = await hasTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.financial_config.manage",
  });
  if (!allowed) return ApiErrors.FORBIDDEN();

  let query;
  try {
    query = parseListQuery(req);
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid query parameters");
  }

  const limit = Math.min(query.limit, 50);
  const sortDir = query.sortDir;

  const where: Prisma.FinanceTeamWhereInput = { tenantId };
  if (!query.includeArchived) {
    where.deletedAt = null;
  }
  if (query.departmentId) {
    where.departmentId = query.departmentId;
  }
  if (query.search?.trim()) {
    where.name = { contains: query.search.trim(), mode: "insensitive" };
  }

  const cursorWhere = (() => {
    if (!query.cursor) return {};
    const decoded = decodeCursor(query.cursor);
    if (!decoded) return {};
    const { id: cursorId, sortValue } = decoded;
    const cmp = sortDir === "desc" ? "lt" : "gt";
    const cmpId = sortDir === "desc" ? "lt" : "gt";
    const dateVal = new Date(sortValue).getTime();
    if (isNaN(dateVal)) return { id: { [cmpId]: cursorId } };
    return {
      OR: [
        { createdAt: { [cmp]: new Date(sortValue) } },
        {
          createdAt: new Date(sortValue),
          id: { [cmpId]: cursorId },
        },
      ],
    };
  })();

  const fullWhere =
    Object.keys(cursorWhere).length > 0 ? { ...where, ...cursorWhere } : where;

  const orderBy: Prisma.FinanceTeamOrderByWithRelationInput[] = [
    { createdAt: sortDir },
    { id: sortDir },
  ];

  const rows = await prisma.financeTeam.findMany({
    where: fullWhere,
    orderBy,
    take: limit + 1,
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

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice[slice.length - 1];
  let nextCursor: string | null = null;
  if (hasMore && last) {
    nextCursor = encodeCursor(last.id, last.createdAt.toISOString());
  }

  return apiSuccess({
    items: slice.map(mapTeamRow),
    nextCursor,
  });
});

/**
 * POST /api/tenant/finance-teams — create team (tenant.financial_config.manage).
 */
export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isPlatformBlocked: true },
  });
  if (!user) return ApiErrors.UNAUTHENTICATED();
  if (user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  const membership = await getDefaultTenantForUser(session.user.id);
  const tenant = membership?.tenant;
  if (!tenant) return ApiErrors.NO_TENANT();
  const tenantId = tenant.id;

  const allowed = await hasTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.financial_config.manage",
  });
  if (!allowed) return ApiErrors.FORBIDDEN();

  const body = await parseBody(req, financeTeamCreateSchema);

  if (body.departmentId) {
    const dept = await prisma.tenantDepartment.findFirst({
      where: { id: body.departmentId, tenantId },
      select: { id: true },
    });
    if (!dept) return ApiErrors.NOT_FOUND("Department");
  }

  const existingName = await prisma.financeTeam.findFirst({
    where: {
      tenantId,
      name: { equals: body.name, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existingName) {
    return ApiErrors.CONFLICT("A finance team with this name already exists.");
  }

  try {
    const team = await prisma.$transaction(async (tx) => {
      const created = await tx.financeTeam.create({
        data: {
          tenantId,
          name: body.name,
          description: body.description ?? null,
          departmentId: body.departmentId ?? null,
          isActive: body.isActive,
          timeZone: body.timeZone ?? null,
          maxConcurrentAssignments: body.maxConcurrentAssignments ?? null,
          createdByUserId: session.user.id,
        },
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

      await tx.auditLog.create({
        data: {
          actorUserId: session.user.id,
          actorContext: "TENANT",
          tenantId,
          action: "tenant.finance_team.created",
          targetType: "FinanceTeam",
          targetId: created.id,
          metadata: {
            name: created.name,
            departmentId: created.departmentId ?? null,
          },
        },
      });

      return created;
    });

    return apiSuccess(mapTeamRow(team), 201);
  } catch (err) {
    if (err instanceof PrismaClientKnownRequestError && err.code === "P2002") {
      return ApiErrors.CONFLICT("A finance team with this name already exists.");
    }
    throw err;
  }
});
