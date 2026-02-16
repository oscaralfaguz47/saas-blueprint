import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/services/audit";
import { verifyTotpCode, hashBackupCode } from "@/server/services/totp";
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
 * POST /api/account/2fa/disable
 * Step-up required. Validate TOTP or backup code, then clear 2FA. Revokes all remembered devices and forces logout.
 */
export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const sessionToken = session.user.sessionToken;
  if (!(await isStepUpEligible(sessionToken, session.user.id))) {
    return ApiErrors.STEP_UP_REQUIRED("Recent authentication required to disable 2FA.");
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
    select: { totpEnabled: true, totpSecretEnc: true, backupCodeHashes: true },
  });
  if (!security || !security.totpEnabled) {
    return ApiErrors.VALIDATION_ERROR("2FA is not enabled.");
  }

  let valid = false;
  if (isSixDigits && security.totpSecretEnc) {
    const raw = decryptTotpSecret(security.totpSecretEnc);
    valid = verifyTotpCode(raw, code);
  } else {
    const hash = hashBackupCode(code, session.user.id);
    const hashes = security.backupCodeHashes ?? [];
    const idx = hashes.indexOf(hash);
    if (idx !== -1) {
      valid = true;
    }
  }
  if (!valid) {
    return ApiErrors.INVALID_2FA_CODE();
  }

  const now = new Date();

  await prisma.$transaction([
    prisma.userSecurity.update({
      where: { userId: session.user.id },
      data: {
        totpEnabled: false,
        totpEnabledAt: null,
        totpSecretEnc: null,
        totpPendingSecretEnc: null,
        backupCodeHashes: [],
        backupCodesGeneratedAt: null,
        mfaEnabled: false,
        forceLogoutAt: now,
      },
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
    action: "account.2fa.disabled",
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
  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId: null,
    action: "account.sessions.forced_logout",
    targetType: "User",
    targetId: session.user.id,
    targetUserId: session.user.id,
  });

  return apiSuccess({ ok: true });
});
