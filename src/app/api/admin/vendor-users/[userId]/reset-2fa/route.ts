import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { checkAdminBreakGlassLimit } from "@/server/security/admin-rate-limit";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { isBootstrapAllowlistedEmail } from "@/server/services/platform-bootstrap";
import { writeAuditLog } from "@/server/services/audit";

const paramsSchema = z.object({ userId: z.string().cuid() });

export const POST = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ userId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.mfa.reset");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const rl = await checkAdminBreakGlassLimit(session.user.id);
  if (!rl.allowed)
    return ApiErrors.RATE_LIMITED("Too many attempts. Try again in a minute.", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });

  const actor = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true },
  });
  if (!actor) return ApiErrors.UNAUTHENTICATED();

  const actorPlatformAdminRole = await prisma.vendorUserRole.findFirst({
    where: { userId: actor.id, role: { name: "PlatformAdmin" } },
    select: { userId: true },
  });
  if (!actorPlatformAdminRole) return ApiErrors.FORBIDDEN();

  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) return ApiErrors.VALIDATION_ERROR("Invalid user id");
  const { userId } = parsed.data;

  if (userId === session.user.id) {
    return ApiErrors.VALIDATION_ERROR("You cannot reset your own 2FA from here.");
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!targetUser) return ApiErrors.NOT_FOUND("User");

  const targetVendorRoles = await prisma.vendorUserRole.findMany({
    where: { userId },
    select: { userId: true },
  });
  if (targetVendorRoles.length === 0) return ApiErrors.NOT_FOUND("Vendor user");

  const actorIsSuperAdmin = isBootstrapAllowlistedEmail(actor.email);
  if (!actorIsSuperAdmin && isBootstrapAllowlistedEmail(targetUser.email)) {
    return ApiErrors.FORBIDDEN();
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.userSecurity.upsert({
      where: { userId },
      create: {
        userId,
        totpEnabled: false,
        totpSecretEnc: null,
        totpPendingSecretEnc: null,
        backupCodeHashes: [],
        backupCodesGeneratedAt: null,
        mfaEnabled: false,
        mfaEnforced: true,
        mfaEnforcedByUserId: actor.id,
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
        mfaEnforced: true,
        mfaEnforcedByUserId: actor.id,
        mfaResetAt: now,
        forceLogoutAt: now,
      },
    }),
    prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, logoutReason: "platform_mfa_reset" },
    }),
    prisma.rememberedDevice.updateMany({
      where: { userId },
      data: { revokedAt: now },
    }),
  ]);

  const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;
  await writeAuditLog({
    actorUserId: actor.id,
    actorContext: "VENDOR",
    action: "admin.vendor_user.2fa_reset",
    targetType: "User",
    targetId: userId,
    targetUserId: userId,
    metadata: { reason: "platform_admin_action" },
    ipAddress,
    userAgent,
  });

  return apiSuccess({ ok: true });
});
