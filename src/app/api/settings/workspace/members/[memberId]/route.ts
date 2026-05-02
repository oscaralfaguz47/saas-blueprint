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
  MemberInvariantError,
  type MemberAccessInvariantError,
} from "@/server/services/member-access";
import {
  MemberAccessUpdateError,
  updateMemberAccessInTransaction,
} from "@/server/services/member-access-update-service";
import { ApiErrors, apiError, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, updateMemberAccessSchema } from "@/lib/validations";
import { z } from "zod";

const paramsSchema = z.object({ memberId: z.string().cuid() });

/**
 * PATCH /api/settings/workspace/members/[memberId]
 *
 * `memberId` is `TenantMembership.id` (cuid), not `User.id`.
 * Updates 4-axis fields and/or legacy TenantUserRole in one atomic transaction (D-1a).
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

  let memberId: string;
  try {
    memberId = paramsSchema.parse(await context.params).memberId;
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid or missing membership id");
  }

  let body: z.infer<typeof updateMemberAccessSchema>;
  try {
    body = await parseBody(req, updateMemberAccessSchema);
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid request body");
  }

  const has4AxisField =
    body.workspaceRole !== undefined ||
    body.financialAccess !== undefined ||
    body.financeResponsibility !== undefined ||
    body.billingAccess !== undefined;
  const hasRoleField = body.role !== undefined;

  if (has4AxisField) {
    const ok = await hasTenantPermission({
      userId: session.user.id,
      tenantId: tenant.id,
      permission: "tenant.users.manage",
    });
    if (!ok) return ApiErrors.FORBIDDEN();
  }

  if (hasRoleField) {
    const ok = await hasTenantPermission({
      userId: session.user.id,
      tenantId: tenant.id,
      permission: "tenant.roles.manage",
    });
    if (!ok) return ApiErrors.FORBIDDEN();
  }

  const stepUpOk = await isStepUpEligible(
    session.user.sessionToken ?? undefined,
    session.user.id
  );
  if (!stepUpOk) return ApiErrors.STEP_UP_REQUIRED();

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

  function mapServiceError(err: MemberAccessUpdateError) {
    if (err.httpStatus === 403 && err.details?.code === "MEMBER_ACCESS_HIERARCHY") {
      return apiError("FORBIDDEN", 403, err.message, {
        code: "MEMBER_ACCESS_HIERARCHY",
      });
    }
    if (err.httpStatus === 404) {
      return ApiErrors.NOT_FOUND(err.message);
    }
    if (err.httpStatus === 403) {
      return ApiErrors.FORBIDDEN();
    }
    if (err.httpStatus === 400) {
      return ApiErrors.VALIDATION_ERROR(err.message, err.details);
    }
    return ApiErrors.FORBIDDEN();
  }

  try {
    const result = await prisma.$transaction(
      async (tx) =>
        updateMemberAccessInTransaction({
          tx,
          tenantId: tenant.id,
          membershipId: memberId,
          actorUserId: session.user.id,
          patch: body,
          ipAddress,
          userAgent,
        }),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );

    return apiSuccess({
      membershipId: result.membershipId,
      userId: result.userId,
      workspaceRole: result.after.workspaceRole,
      financialAccess: result.after.financialAccess,
      financeResponsibility: result.after.financeResponsibility,
      billingAccess: result.after.billingAccess,
      role: result.after.role,
    });
  } catch (err) {
    if (err instanceof MemberInvariantError) {
      return mapInvariant(err.code);
    }
    if (err instanceof MemberAccessUpdateError) {
      return mapServiceError(err);
    }
    if (err instanceof Error && err.message === "MEMBERSHIP_STALE") {
      return ApiErrors.NOT_FOUND("Member");
    }
    throw err;
  }
});
