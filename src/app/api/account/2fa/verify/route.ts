import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/services/audit";
import { requireFullSessionOrForcedMfaSetup } from "@/server/require-full-session";
import {
  verifyTotpCode,
  generateBackupCodes,
  hashBackupCode,
} from "@/server/services/totp";
import { decryptTotpSecret, encryptTotpSecret } from "@/server/services/account-encryption";
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
 * POST /api/account/2fa/verify
 * If pending setup: validate code, enable TOTP, generate backup codes, return codes once.
 * If already enabled (login challenge): validate code, set Session.mfaVerifiedAt.
 */
export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSessionOrForcedMfaSetup(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, isPlatformBlocked: true },
  });
  if (!user) return ApiErrors.NOT_FOUND("User");
  if (user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  if (!checkRateLimit(session.user.id)) {
    return ApiErrors.RATE_LIMITED("Too many 2FA verify attempts. Try again in a minute.");
  }

  const body = await parseBody(req, twoFaVerifySchema);

  const security = await prisma.userSecurity.findUnique({
    where: { userId: session.user.id },
    select: {
      totpPendingSecretEnc: true,
      totpSecretEnc: true,
      totpEnabled: true,
      backupCodeHashes: true,
    },
  });
  if (!security) return ApiErrors.NOT_FOUND("User security");

  const code = body.code.trim();
  const isSixDigits = /^[0-9]{6}$/.test(code);

  // Case 1: Pending setup — complete setup and return backup codes
  if (security.totpPendingSecretEnc) {
    const raw = decryptTotpSecret(security.totpPendingSecretEnc);
    if (!verifyTotpCode(raw, code)) {
      return ApiErrors.VALIDATION_ERROR("Invalid or expired code.");
    }
    const backupCodes = generateBackupCodes();
    const backupCodeHashes = backupCodes.map((c) => hashBackupCode(c, session.user.id));

    const now = new Date();
    await prisma.$transaction([
      prisma.userSecurity.upsert({
        where: { userId: session.user.id },
        create: {
          userId: session.user.id,
          totpSecretEnc: security.totpPendingSecretEnc,
          totpPendingSecretEnc: null,
          totpEnabled: true,
          totpEnabledAt: now,
          mfaEnabled: true,
          backupCodeHashes,
          backupCodesGeneratedAt: now,
        },
        update: {
          totpSecretEnc: security.totpPendingSecretEnc,
          totpPendingSecretEnc: null,
          totpEnabled: true,
          totpEnabledAt: now,
          mfaEnabled: true,
          backupCodeHashes,
          backupCodesGeneratedAt: now,
        },
      }),
    ]);

    await writeAuditLog({
      actorUserId: session.user.id,
      actorContext: "TENANT",
      tenantId: null,
      action: "account.2fa.enabled",
      targetType: "User",
      targetId: session.user.id,
      targetUserId: session.user.id,
    });

    // Mark ALL sessions for this user as 2FA-verified so user is not redirected to /auth/2fa after setup
    await prisma.session.updateMany({
      where: { userId: session.user.id },
      data: { mfaVerifiedAt: new Date() },
    });

    return apiSuccess({ backupCodes, verified: true });
  }

  // Case 2: Already enabled — login challenge should use POST /api/auth/2fa/verify (session rotation).
  // This path supports in-app re-verify only (e.g. after session refresh); we just set mfaVerifiedAt on current session.
  if (security.totpEnabled && security.totpSecretEnc) {
    let valid = false;
    if (isSixDigits) {
      const raw = decryptTotpSecret(security.totpSecretEnc);
      valid = verifyTotpCode(raw, code);
    } else {
      const hash = hashBackupCode(code, session.user.id);
      const hashes = security.backupCodeHashes ?? [];
      const idx = hashes.indexOf(hash);
      if (idx !== -1) {
        valid = true;
        const next = hashes.filter((_, i) => i !== idx);
        await prisma.userSecurity.update({
          where: { userId: session.user.id },
          data: { backupCodeHashes: next },
        });
      }
    }
    if (!valid) {
      return ApiErrors.INVALID_2FA_CODE();
    }
    if (session.user.sessionToken) {
      await prisma.session.updateMany({
        where: { sessionToken: session.user.sessionToken },
        data: { mfaVerifiedAt: new Date() },
      });
    } else {
      await prisma.session.updateMany({
        where: { userId: session.user.id },
        data: { mfaVerifiedAt: new Date() },
      });
    }
    return apiSuccess({ verified: true });
  }

  return ApiErrors.NO_PENDING_2FA_SETUP();
});
