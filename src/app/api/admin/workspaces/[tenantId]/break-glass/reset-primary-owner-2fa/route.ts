import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { checkAdminBreakGlassLimit } from "@/server/security/admin-rate-limit";
import { isStepUpEligible } from "@/server/services/step-up";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/services/audit";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { adminBreakGlassReset2FABodySchema } from "@/lib/validations/admin";
import { parseBody } from "@/lib/validations";
import { ValidationError } from "@/lib/validations/common";
import { z } from "zod";

const paramsSchema = z.object({ tenantId: z.string().cuid() });

export const POST = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const authErrorTenants = await requireAdminAuth(session, "admin.tenants.read");
  if (authErrorTenants) return authErrorTenants;
  const authErrorMfa = await requireAdminAuth(session, "admin.mfa.reset");
  if (authErrorMfa) return authErrorMfa;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const rl = await checkAdminBreakGlassLimit(session.user.id);
  if (!rl.allowed)
    return ApiErrors.RATE_LIMITED("Too many attempts. Try again in a minute.", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });

  const stepUpOk = await isStepUpEligible(
    session.user.sessionToken ?? undefined,
    session.user.id
  );
  if (!stepUpOk) return ApiErrors.STEP_UP_REQUIRED();

  const { tenantId } = paramsSchema.parse(await context.params);

  let body: { confirm: "RESET 2FA" };
  try {
    body = await parseBody(req, adminBreakGlassReset2FABodySchema);
  } catch (e) {
    if (e instanceof ValidationError) {
      return ApiErrors.VALIDATION_ERROR('Body must include confirm: "RESET 2FA"');
    }
    throw e;
  }
  if (body.confirm !== "RESET 2FA")
    return ApiErrors.VALIDATION_ERROR('Confirmation must be exactly "RESET 2FA"');

  const primaryOwnerMembership = await prisma.tenantMembership.findFirst({
    where: {
      tenantId,
      roles: { some: { role: { name: "Primary Owner" } } },
    },
    select: { userId: true },
  });
  if (!primaryOwnerMembership) return ApiErrors.NOT_FOUND("Primary owner not found for this workspace.");

  const targetUserId = primaryOwnerMembership.userId;
  const now = new Date();

  await prisma.$transaction([
    prisma.userSecurity.upsert({
      where: { userId: targetUserId },
      create: {
        userId: targetUserId,
        totpEnabled: false,
        totpSecretEnc: null,
        totpPendingSecretEnc: null,
        backupCodeHashes: [],
        backupCodesGeneratedAt: null,
        mfaEnabled: false,
        mfaResetAt: now,
        forceLogoutAt: now,
      },
      update: {
        totpEnabled: false,
        totpEnabledAt: null,
        totpSecretEnc: null,
        totpPendingSecretEnc: null,
        backupCodeHashes: [],
        backupCodesGeneratedAt: null,
        mfaEnabled: false,
        mfaResetAt: now,
        forceLogoutAt: now,
      },
    }),
    prisma.rememberedDevice.updateMany({
      where: { userId: targetUserId },
      data: { revokedAt: now },
    }),
    prisma.session.updateMany({
      where: { userId: targetUserId },
      data: { revokedAt: now, logoutReason: "platform_mfa_reset" },
    }),
  ]);

  const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;
  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "VENDOR",
    tenantId,
    action: "admin.workspace.primary_owner.mfa_reset",
    targetType: "User",
    targetId: targetUserId,
    targetUserId: targetUserId,
    metadata: { reason: "break_glass" },
    ipAddress,
    userAgent,
  });

  return apiSuccess({ ok: true });
});
