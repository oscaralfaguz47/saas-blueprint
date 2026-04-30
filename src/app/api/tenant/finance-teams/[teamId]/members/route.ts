import "server-only";

import type { FinanceResponsibility, Prisma } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import {
  parseBody,
  financeTeamMemberAddSchema,
  financeTeamMemberListQuerySchema,
} from "@/lib/validations";

const paramsSchema = z.object({ teamId: z.string().cuid() });

const ALLOWED_FINANCE_RESPONSIBILITY = new Set<FinanceResponsibility>([
  "PROCESS",
  "PROCESS_AND_APPROVE",
]);

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

async function requireFinanceTeamManager(sessionUserId: string) {
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

const memberSelect = {
  id: true,
  membershipId: true,
  weight: true,
  isLead: true,
  joinedAt: true,
  deletedAt: true,
  membership: {
    select: {
      userId: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
        },
      },
    },
  },
} as const;

function mapMemberRow(
  r: Prisma.FinanceTeamMemberGetPayload<{ select: typeof memberSelect }>
) {
  return {
    id: r.id,
    membershipId: r.membershipId,
    weight: r.weight,
    isLead: r.isLead,
    joinedAt: r.joinedAt,
    deletedAt: r.deletedAt,
    membership: {
      userId: r.membership.userId,
      user: {
        id: r.membership.user.id,
        email: r.membership.user.email,
        name: r.membership.user.name,
        image: r.membership.user.image,
      },
    },
  };
}

function parseListQuery(req: Request) {
  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  return financeTeamMemberListQuerySchema.parse({
    limit: raw.limit,
    cursor: raw.cursor || undefined,
    includeArchived: raw.includeArchived,
  });
}

/**
 * GET /api/tenant/finance-teams/[teamId]/members
 */
export const GET = withErrorHandler(async (
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
  const tenant = gate.tenant!;

  const team = await prisma.financeTeam.findFirst({
    where: { id: teamId, tenantId: tenant.id, deletedAt: null },
    select: { id: true },
  });
  if (!team) return ApiErrors.NOT_FOUND("Finance team");

  let query: z.infer<typeof financeTeamMemberListQuerySchema>;
  try {
    query = parseListQuery(req);
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid query parameters");
  }

  const limit = Math.min(query.limit, 50);

  const where: Prisma.FinanceTeamMemberWhereInput = {
    teamId,
    tenantId: tenant.id,
  };
  if (!query.includeArchived) {
    where.deletedAt = null;
  }

  const cursorWhere = (() => {
    if (!query.cursor) return {};
    const decoded = decodeCursor(query.cursor);
    if (!decoded) return {};
    const { id: cursorId, sortValue } = decoded;
    const dateVal = new Date(sortValue).getTime();
    if (isNaN(dateVal)) return { id: { lt: cursorId } };
    return {
      OR: [
        { joinedAt: { lt: new Date(sortValue) } },
        {
          joinedAt: new Date(sortValue),
          id: { lt: cursorId },
        },
      ],
    };
  })();

  const fullWhere =
    Object.keys(cursorWhere).length > 0 ? { AND: [where, cursorWhere] } : where;

  const rows = await prisma.financeTeamMember.findMany({
    where: fullWhere,
    orderBy: [{ joinedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: memberSelect,
  });

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice[slice.length - 1];
  let nextCursor: string | null = null;
  if (hasMore && last) {
    nextCursor = encodeCursor(last.id, last.joinedAt.toISOString());
  }

  return apiSuccess({
    items: slice.map(mapMemberRow),
    nextCursor,
  });
});

/**
 * POST /api/tenant/finance-teams/[teamId]/members — add or reactivate member.
 */
export const POST = withErrorHandler(async (
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
  const tenant = gate.tenant!;

  const team = await prisma.financeTeam.findFirst({
    where: { id: teamId, tenantId: tenant.id, deletedAt: null },
    select: { id: true },
  });
  if (!team) return ApiErrors.NOT_FOUND("Finance team");

  const body = await parseBody(req, financeTeamMemberAddSchema);
  const weight = body.weight ?? 100;
  const isLead = body.isLead ?? false;

  const tm = await prisma.tenantMembership.findFirst({
    where: { id: body.membershipId },
    select: {
      tenantId: true,
      status: true,
      financeResponsibility: true,
    },
  });
  if (!tm) {
    return ApiErrors.VALIDATION_ERROR("Membership not found.");
  }
  if (tm.tenantId !== tenant.id) {
    return ApiErrors.VALIDATION_ERROR("Membership does not belong to this workspace.");
  }
  if (tm.status !== "ACTIVE") {
    return ApiErrors.VALIDATION_ERROR("Membership is not active.");
  }
  if (!ALLOWED_FINANCE_RESPONSIBILITY.has(tm.financeResponsibility)) {
    return ApiErrors.VALIDATION_ERROR(
      "This member does not have finance processing responsibility.",
      { code: "MEMBERSHIP_LACKS_FINANCE_RESPONSIBILITY" }
    );
  }

  const existing = await prisma.financeTeamMember.findFirst({
    where: { teamId, membershipId: body.membershipId },
    select: { id: true, deletedAt: true },
  });

  if (existing && existing.deletedAt === null) {
    return ApiErrors.CONFLICT("User is already a member of this team.", {
      code: "ALREADY_MEMBER",
    });
  }

  const actorUserId = session.user.id;

  try {
    if (existing && existing.deletedAt !== null) {
      const row = await prisma.$transaction(async (tx) => {
        const updated = await tx.financeTeamMember.update({
          where: { id: existing.id },
          data: {
            deletedAt: null,
            joinedAt: new Date(),
            addedByUserId: actorUserId,
            weight,
            isLead,
          },
          select: memberSelect,
        });

        await tx.auditLog.create({
          data: {
            actorUserId,
            actorContext: "TENANT",
            tenantId: tenant.id,
            action: "tenant.finance_team.member_added",
            targetType: "FinanceTeamMember",
            targetId: updated.id,
            metadata: {
              teamId,
              membershipId: body.membershipId,
              memberId: updated.id,
              reactivated: true,
              weight,
              isLead,
            },
          },
        });

        return updated;
      });

      return apiSuccess({ member: mapMemberRow(row), reactivated: true as const }, 200);
    }

    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.financeTeamMember.create({
        data: {
          tenantId: tenant.id,
          teamId,
          membershipId: body.membershipId,
          weight,
          isLead,
          addedByUserId: actorUserId,
        },
        select: memberSelect,
      });

      await tx.auditLog.create({
        data: {
          actorUserId,
          actorContext: "TENANT",
          tenantId: tenant.id,
          action: "tenant.finance_team.member_added",
          targetType: "FinanceTeamMember",
          targetId: created.id,
          metadata: {
            teamId,
            membershipId: body.membershipId,
            memberId: created.id,
            reactivated: false,
            weight,
            isLead,
          },
        },
      });

      return created;
    });

    return apiSuccess({ member: mapMemberRow(row), reactivated: false as const }, 201);
  } catch (e) {
    if (e instanceof PrismaClientKnownRequestError && e.code === "P2002") {
      return ApiErrors.CONFLICT("User is already a member of this team.", {
        code: "ALREADY_MEMBER",
      });
    }
    throw e;
  }
});
