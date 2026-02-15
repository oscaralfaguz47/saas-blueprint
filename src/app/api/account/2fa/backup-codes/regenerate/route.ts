import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/services/audit";
import { verifyTotpCode, generateBackupCodes, hashBackupCode } from "@/server/services/totp";
import { decryptTotpSecret } from "@/server/services/account-encryption";
import { isStepUpEligible } from "@/server/services/step-up";
import { requireFullSession } from "@/server/require-full-session";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, twoFaVerifySchema } from "@/lib/validations";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 5;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (now >= entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

/**
 * POST /api/account/2fa/backup-codes/regenerate
 * Step-up required. Validate TOTP, then replace backup codes and return new codes once. Revokes all remembered devices.
 */
export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = requireFullSession(session);
  if (mfaError) return mfaError;

  const sessionToken = session!.user.sessionToken;
  if (!sessionToken || !(await isStepUpEligible(sessionToken, session.user.id))) {
    return ApiErrors.STEP_UP_REQUIRED("Recent authentication required to regenerate backup codes.");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, isPlatformBlocked: true },
  });
  if (!user) return ApiErrors.NOT_FOUND("User");
  if (user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  if (!checkRateLimit(session.user.id)) {
    return ApiErrors.RATE_LIMITED("Too many attempts. Try again in a minute.");
  }

  const body = await parseBody(req, twoFaVerifySchema);
  const code = body.code.trim();
  const isSixDigits = /^[0-9]{6}$/.test(code);

  const security = await prisma.userSecurity.findUnique({
    where: { userId: session.user.id },
    select: { totpEnabled: true, totpSecretEnc: true },
  });
  if (!security || !security.totpEnabled || !security.totpSecretEnc) {
    return ApiErrors.VALIDATION_ERROR("2FA is not enabled.");
  }

  if (!isSixDigits) {
    return ApiErrors.VALIDATION_ERROR("Enter your current 6-digit authenticator code to regenerate backup codes.");
  }

  const raw = decryptTotpSecret(security.totpSecretEnc);
  if (!verifyTotpCode(raw, code)) {
    return ApiErrors.VALIDATION_ERROR("Invalid or expired code.");
  }

  const backupCodes = generateBackupCodes();
  const backupCodeHashes = backupCodes.map((c) => hashBackupCode(c, session.user.id));
  const now = new Date();

  await prisma.$transaction([
    prisma.userSecurity.update({
      where: { userId: session.user.id },
      data: { backupCodeHashes, backupCodesGeneratedAt: now },
    }),
    prisma.rememberedDevice.updateMany({
      where: { userId: session.user.id },
      data: { revokedAt: now },
    }),
  ]);

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId: null,
    action: "account.2fa.backup_codes_regenerated",
    targetType: "User",
    targetId: session.user.id,
    targetUserId: session.user.id,
  });
  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId: null,
    action: "account.remember_device.revoked_all",
    targetType: "User",
    targetId: session.user.id,
    targetUserId: session.user.id,
  });

  return apiSuccess({ backupCodes });
});
