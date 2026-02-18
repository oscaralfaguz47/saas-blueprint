import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import {
  getMemberSecurityContext,
  canManageMemberSecurity,
  assertGovernanceConstraints,
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
 * PATCH /api/settings/workspace/members/[memberId]/security/reset-2fa
 * E6: Reset member 2FA (clear TOTP and backup codes), set forceLogoutAt, revoke remembered devices.
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

  const targetSecurity = await prisma.userSecurity.findUnique({
    where: { userId: targetUserId },
    select: { totpEnabled: true },
  });
  if (!targetSecurity?.totpEnabled) {
    return apiSuccess({ ok: true, skipped: true, reason: "no_2fa_to_reset" });
  }

  try {
    await assertGovernanceConstraints(
      tenant.id,
      targetUserId,
      ctx.targetRole,
      "reset-2fa"
    );
  } catch (err) {
    return ApiErrors.GOVERNANCE_CONSTRAINT_VIOLATION(
      err instanceof Error ? err.message : undefined
    );
  }
  if (!checkMemberSecurityRateLimit(session.user.id)) {
    return ApiErrors.RATE_LIMITED(
      "Too many security actions. Try again in a minute."
    );
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.userSecurity.upsert({
      where: { userId: targetUserId },
      create: {
        userId: targetUserId,
        totpEnabled: false,
        totpEnabledAt: null,
        totpSecretEnc: null,
        totpPendingSecretEnc: null,
        backupCodeHashes: [],
        backupCodesGeneratedAt: null,
        forceLogoutAt: now,
      },
      update: {
        totpEnabled: false,
        totpEnabledAt: null,
        totpSecretEnc: null,
        totpPendingSecretEnc: null,
        backupCodeHashes: [],
        backupCodesGeneratedAt: null,
        forceLogoutAt: now,
      },
    }),
    prisma.rememberedDevice.updateMany({
      where: { userId: targetUserId },
      data: { revokedAt: now },
    }),
  ]);

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId: tenant.id,
    action: "workspace.member_security.2fa_reset",
    targetType: "User",
    targetId: targetUserId,
    targetUserId: targetUserId,
    metadata: {},
    ipAddress: _req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: _req.headers.get("user-agent") ?? null,
  });

  return apiSuccess({ ok: true });
});
