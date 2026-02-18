import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import {
  getMemberSecurityContext,
  canManageMemberSecurity,
  checkMemberSecurityRateLimit,
} from "@/server/security/member-security-governance";
import { isStepUpEligible } from "@/server/services/step-up";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { writeAuditLog } from "@/server/services/audit";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

const paramsSchema = z.object({ memberId: z.string().cuid() });

/**
 * PATCH /api/settings/workspace/members/[memberId]/security/disable-2fa
 * E6: Remove this workspace's 2FA requirement for the member (clear WorkspaceMemberSecurity).
 * Does NOT clear the user's global TOTP/backup codes — they keep 2FA if they have it.
 * Revokes sessions so the member gets a fresh login where this workspace no longer enforces 2FA.
 */
export const PATCH = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ memberId: string }> }
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
    permission: "tenant.users.manage",
  });
  if (!allowed) return ApiErrors.FORBIDDEN();

  const stepUpOk = await isStepUpEligible(
    session.user.sessionToken ?? undefined,
    session.user.id
  );
  if (!stepUpOk) return ApiErrors.STEP_UP_REQUIRED();

  let targetUserId: string;
  try {
    const rawParams = await context.params;
    targetUserId = paramsSchema.parse(rawParams).memberId;
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid or missing member id");
  }
  if (targetUserId === session.user.id) {
    return ApiErrors.FORBIDDEN();
  }

  const ctx = await getMemberSecurityContext(
    tenant.id,
    session.user.id,
    targetUserId
  );
  if (!ctx) return ApiErrors.NOT_FOUND("Member in this workspace");
  if (!canManageMemberSecurity(ctx.actorRole, ctx.targetRole)) {
    return ApiErrors.FORBIDDEN();
  }

  const workspaceSecurity =
    await prisma.workspaceMemberSecurity.findUnique({
      where: {
        tenantId_userId: { tenantId: tenant.id, userId: targetUserId },
      },
      select: { mfaEnforced: true },
    });
  if (!workspaceSecurity?.mfaEnforced) {
    return apiSuccess({ ok: true, alreadyDisabled: true });
  }

  if (!checkMemberSecurityRateLimit(session.user.id)) {
    return ApiErrors.RATE_LIMITED(
      "Too many security actions. Try again in a minute."
    );
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.workspaceMemberSecurity.upsert({
      where: {
        tenantId_userId: { tenantId: tenant.id, userId: targetUserId },
      },
      create: {
        tenantId: tenant.id,
        userId: targetUserId,
        mfaEnforced: false,
        enforcedByUserId: null,
        enforcedAt: null,
      },
      update: {
        mfaEnforced: false,
        enforcedByUserId: null,
        enforcedAt: null,
      },
    }),
    prisma.userSecurity.upsert({
      where: { userId: targetUserId },
      create: {
        userId: targetUserId,
        forceLogoutAt: now,
      },
      update: { forceLogoutAt: now },
    }),
    prisma.session.updateMany({
      where: { userId: targetUserId },
      data: { revokedAt: now, logoutReason: "force_logout" },
    }),
  ]);

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId: tenant.id,
    action: "workspace.member_security.2fa_disabled",
    targetType: "User",
    targetId: targetUserId,
    targetUserId: targetUserId,
    metadata: {},
    ipAddress: _req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: _req.headers.get("user-agent") ?? null,
  });

  return apiSuccess({ ok: true });
});
