import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { isStepUpEligible } from "@/server/services/step-up";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { MemberInvariantError, type MemberAccessInvariantError } from "@/server/services/member-access";
import {
  MemberAccessUpdateError,
  updateMemberAccessInTransaction,
} from "@/server/services/member-access-update-service";
import { ApiErrors, apiError, withErrorHandler } from "@/lib/api-response";
import { parseBody, updateMemberRoleSchema } from "@/lib/validations";
import { getBaseUrlFromRequest } from "@/lib/request-utils";
import { z } from "zod";

const paramsSchema = z.object({ userId: z.string().cuid() });

/**
 * PATCH /api/tenant/users/[userId]/role
 *
 * @deprecated D-1a — use `PATCH /api/settings/workspace/members/[membershipId]` with `role` in body.
 * Retained for backward compatibility; returns Deprecation + Sunset + Link headers.
 */
export const PATCH = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ userId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const membership = await getDefaultTenantForUser(session.user.id);
  const tenant = membership?.tenant;
  if (!tenant) return ApiErrors.NO_TENANT();

  const allowed = await hasTenantPermission({
    userId: session.user.id,
    tenantId: tenant.id,
    permission: "tenant.roles.manage",
  });
  if (!allowed) return ApiErrors.FORBIDDEN();

  const { userId: targetUserId } = paramsSchema.parse(await context.params);
  const body = await parseBody(req, updateMemberRoleSchema);

  const targetMembership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: targetUserId } },
    select: { id: true },
  });
  if (!targetMembership) return ApiErrors.NOT_FOUND("Member");

  const stepUpOk = await isStepUpEligible(
    session.user.sessionToken ?? undefined,
    session.user.id
  );
  if (!stepUpOk) return ApiErrors.STEP_UP_REQUIRED();

  console.warn("[deprecated-endpoint] PATCH /api/tenant/users/:userId/role invoked", {
    route: "PATCH /api/tenant/users/:userId/role",
    tenantId: tenant.id,
  });

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
    await prisma.$transaction(
      async (tx) =>
        updateMemberAccessInTransaction({
          tx,
          tenantId: tenant.id,
          membershipId: targetMembership.id,
          actorUserId: session.user.id,
          patch: { role: body.role },
          ipAddress,
          userAgent,
        }),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );
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

  const baseUrl = getBaseUrlFromRequest(req).replace(/\/$/, "");
  const successorUrl = `${baseUrl}/api/settings/workspace/members/${targetMembership.id}`;
  const res = NextResponse.json({ data: { ok: true } }, { status: 200 });
  res.headers.set("Deprecation", "true");
  res.headers.set("Sunset", "Sat, 01 Jan 2027 00:00:00 GMT");
  res.headers.set("Link", `<${successorUrl}>; rel="successor-version"`);
  return res;
});
