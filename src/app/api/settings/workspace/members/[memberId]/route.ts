import "server-only";

import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { isStepUpEligible } from "@/server/services/step-up";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import {
  checkMemberAccessInvariants,
  MemberInvariantError,
  type MemberAccessInvariantError,
} from "@/server/services/member-access";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, updateMember4AxisSchema } from "@/lib/validations";
import { z } from "zod";

const paramsSchema = z.object({ memberId: z.string().cuid() });

/**
 * PATCH /api/settings/workspace/members/[memberId]
 *
 * `memberId` is `TenantMembership.id` (cuid), not `User.id`.
 * Updates 4-axis fields only (workspaceRole, financialAccess, financeResponsibility, billingAccess).
 * Primary Owner rows cannot be changed here — use `POST /api/tenant/primary-owner/transfer`.
 */
export const PATCH = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ memberId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isPlatformBlocked: true },
  });
  if (!user || user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  const membership = await getDefaultTenantForUser(session.user.id);
  const tenant = membership?.tenant;
  if (!tenant) return ApiErrors.NO_TENANT();

  const allowed = await hasTenantPermission({
    userId: session.user.id,
    tenantId: tenant.id,
    permission: "tenant.users.manage",
  });
  if (!allowed) return ApiErrors.FORBIDDEN();

  const stepUpOk = await isStepUpEligible(
    session.user.sessionToken ?? undefined,
    session.user.id
  );
  if (!stepUpOk) return ApiErrors.STEP_UP_REQUIRED();

  let memberId: string;
  try {
    memberId = paramsSchema.parse(await context.params).memberId;
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid or missing membership id");
  }

  let body: z.infer<typeof updateMember4AxisSchema>;
  try {
    body = await parseBody(req, updateMember4AxisSchema);
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid request body");
  }

  const target = await prisma.tenantMembership.findFirst({
    where: { id: memberId, tenantId: tenant.id },
    select: {
      id: true,
      userId: true,
      status: true,
      workspaceRole: true,
      financialAccess: true,
      financeResponsibility: true,
      billingAccess: true,
      roles: { select: { role: { select: { name: true } } } },
    },
  });

  if (!target || target.status !== "ACTIVE") {
    return ApiErrors.NOT_FOUND("Member");
  }

  if (target.userId === session.user.id) {
    return ApiErrors.FORBIDDEN();
  }

  const isPrimaryOwner = target.roles.some((r) => r.role.name === "Primary Owner");
  const patchTouchesAxis =
    body.workspaceRole !== undefined ||
    body.financialAccess !== undefined ||
    body.financeResponsibility !== undefined ||
    body.billingAccess !== undefined;

  if (isPrimaryOwner && patchTouchesAxis) {
    return ApiErrors.VALIDATION_ERROR(
      "Primary Owner access must be changed via the primary owner transfer flow.",
      { code: "PRIMARY_OWNER_AXIS_LOCKED" }
    );
  }

  const before = {
    workspaceRole: target.workspaceRole,
    financialAccess: target.financialAccess,
    financeResponsibility: target.financeResponsibility,
    billingAccess: target.billingAccess,
  };

  const fieldsChanged: string[] = [];
  if (body.workspaceRole !== undefined) fieldsChanged.push("workspaceRole");
  if (body.financialAccess !== undefined) fieldsChanged.push("financialAccess");
  if (body.financeResponsibility !== undefined) {
    fieldsChanged.push("financeResponsibility");
  }
  if (body.billingAccess !== undefined) fieldsChanged.push("billingAccess");

  const updateData: Prisma.TenantMembershipUpdateInput = {};
  if (body.workspaceRole !== undefined) updateData.workspaceRole = body.workspaceRole;
  if (body.financialAccess !== undefined) {
    updateData.financialAccess = body.financialAccess;
  }
  if (body.financeResponsibility !== undefined) {
    updateData.financeResponsibility = body.financeResponsibility;
  }
  if (body.billingAccess !== undefined) updateData.billingAccess = body.billingAccess;

  const after = {
    workspaceRole: body.workspaceRole ?? target.workspaceRole,
    financialAccess: body.financialAccess ?? target.financialAccess,
    financeResponsibility:
      body.financeResponsibility ?? target.financeResponsibility,
    billingAccess: body.billingAccess ?? target.billingAccess,
  };

  const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;

  function mapInvariant(code: MemberAccessInvariantError) {
    if (
      code === "AT_LEAST_ONE_OWNER_REQUIRES_BILLING_MANAGE" ||
      code === "CANNOT_DEMOTE_LAST_OWNER"
    ) {
      return ApiErrors.CONFLICT("Workspace membership rules prevent this change.", {
        code,
      });
    }
    return ApiErrors.VALIDATION_ERROR("Invalid access combination for this member.", {
      code,
    });
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        const invariant = await checkMemberAccessInvariants({
          tx,
          tenantId: tenant.id,
          membershipId: memberId,
          patch: body,
        });
        if (invariant !== null) {
          throw new MemberInvariantError(invariant);
        }

        await tx.tenantMembership.update({
          where: { id: memberId },
          data: updateData,
        });

        await tx.auditLog.create({
          data: {
            actorUserId: session.user.id,
            actorContext: "TENANT",
            tenantId: tenant.id,
            action: "tenant.member.access_updated",
            targetType: "TenantMembership",
            targetId: memberId,
            targetUserId: target.userId,
            metadata: {
              membershipId: memberId,
              before,
              after: {
                workspaceRole: after.workspaceRole,
                financialAccess: after.financialAccess,
                financeResponsibility: after.financeResponsibility,
                billingAccess: after.billingAccess,
              },
              fieldsChanged,
            },
            ipAddress,
            userAgent,
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );
  } catch (err) {
    if (err instanceof MemberInvariantError) {
      return mapInvariant(err.code);
    }
    if (err instanceof Error && err.message === "MEMBERSHIP_STALE") {
      return ApiErrors.NOT_FOUND("Member");
    }
    throw err;
  }

  return apiSuccess({
    membershipId: memberId,
    userId: target.userId,
    workspaceRole: after.workspaceRole,
    financialAccess: after.financialAccess,
    financeResponsibility: after.financeResponsibility,
    billingAccess: after.billingAccess,
  });
});
