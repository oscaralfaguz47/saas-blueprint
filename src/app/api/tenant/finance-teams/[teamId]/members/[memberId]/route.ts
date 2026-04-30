import "server-only";

import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, financeTeamMemberPatchSchema } from "@/lib/validations";

const paramsSchema = z.object({
  teamId: z.string().cuid(),
  memberId: z.string().cuid(),
});

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

function mapMemberRow(r: {
  id: string;
  membershipId: string;
  weight: number;
  isLead: boolean;
  joinedAt: Date;
  deletedAt: Date | null;
  membership: {
    userId: string;
    user: {
      id: string;
      email: string | null;
      name: string | null;
      image: string | null;
    };
  };
}) {
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

/**
 * PATCH /api/tenant/finance-teams/[teamId]/members/[memberId]
 */
export const PATCH = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ teamId: string; memberId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const paramsResult = paramsSchema.safeParse(await context.params);
  if (!paramsResult.success) return ApiErrors.VALIDATION_ERROR("Invalid id");
  const { teamId, memberId } = paramsResult.data;

  const gate = await requireFinanceTeamManager(session.user.id);
  if (gate.error) return gate.error;
  const tenant = gate.tenant!;

  const team = await prisma.financeTeam.findFirst({
    where: { id: teamId, tenantId: tenant.id, deletedAt: null },
    select: { id: true },
  });
  if (!team) return ApiErrors.NOT_FOUND("Finance team");

  const existing = await prisma.financeTeamMember.findFirst({
    where: { id: memberId, teamId, tenantId: tenant.id, deletedAt: null },
    select: {
      id: true,
      weight: true,
      isLead: true,
      membershipId: true,
      membership: { select: { tenantId: true } },
    },
  });
  if (!existing) return ApiErrors.NOT_FOUND("Team member");
  if (existing.membership.tenantId !== tenant.id) {
    return ApiErrors.VALIDATION_ERROR("Membership does not belong to this workspace.");
  }

  const body = await parseBody(req, financeTeamMemberPatchSchema);

  const before = { weight: existing.weight, isLead: existing.isLead };
  const data: { weight?: number; isLead?: boolean } = {};
  if (body.weight !== undefined) data.weight = body.weight;
  if (body.isLead !== undefined) data.isLead = body.isLead;

  const fieldsChanged: string[] = [];
  if (body.weight !== undefined && body.weight !== existing.weight) fieldsChanged.push("weight");
  if (body.isLead !== undefined && body.isLead !== existing.isLead) fieldsChanged.push("isLead");

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.financeTeamMember.update({
      where: { id: memberId },
      data,
      select: memberSelect,
    });

    const after = { weight: updated.weight, isLead: updated.isLead };

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId: tenant.id,
        action: "tenant.finance_team.member_updated",
        targetType: "FinanceTeamMember",
        targetId: memberId,
        metadata: {
          teamId,
          memberId,
          before,
          after,
          fieldsChanged,
        },
      },
    });

    return updated;
  });

  return apiSuccess(mapMemberRow(row));
});

/**
 * DELETE /api/tenant/finance-teams/[teamId]/members/[memberId] — soft remove (deletedAt only).
 */
export const DELETE = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ teamId: string; memberId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const paramsResult = paramsSchema.safeParse(await context.params);
  if (!paramsResult.success) return ApiErrors.VALIDATION_ERROR("Invalid id");
  const { teamId, memberId } = paramsResult.data;

  const gate = await requireFinanceTeamManager(session.user.id);
  if (gate.error) return gate.error;
  const tenant = gate.tenant!;

  const team = await prisma.financeTeam.findFirst({
    where: { id: teamId, tenantId: tenant.id, deletedAt: null },
    select: { id: true },
  });
  if (!team) return ApiErrors.NOT_FOUND("Finance team");

  const existing = await prisma.financeTeamMember.findFirst({
    where: { id: memberId, teamId, tenantId: tenant.id },
    select: {
      id: true,
      deletedAt: true,
      membershipId: true,
      membership: { select: { tenantId: true } },
    },
  });
  if (!existing) return ApiErrors.NOT_FOUND("Team member");
  if (existing.membership.tenantId !== tenant.id) {
    return ApiErrors.VALIDATION_ERROR("Membership does not belong to this workspace.");
  }
  if (existing.deletedAt !== null) return ApiErrors.NOT_FOUND("Team member");

  await prisma.$transaction(async (tx) => {
    await tx.financeTeamMember.update({
      where: { id: memberId },
      data: { deletedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId: tenant.id,
        action: "tenant.finance_team.member_removed",
        targetType: "FinanceTeamMember",
        targetId: memberId,
        metadata: {
          teamId,
          membershipId: existing.membershipId,
          memberId,
        },
      },
    });
  });

  return apiSuccess({ ok: true as const });
});
