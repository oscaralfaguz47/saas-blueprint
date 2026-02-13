import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/services/audit";
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
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

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

    await prisma.$transaction([
      prisma.userSecurity.upsert({
        where: { userId: session.user.id },
        create: {
          userId: session.user.id,
          totpSecretEnc: security.totpPendingSecretEnc,
          totpPendingSecretEnc: null,
          totpEnabled: true,
          totpEnabledAt: new Date(),
          mfaEnabled: true,
          backupCodeHashes,
        },
        update: {
          totpSecretEnc: security.totpPendingSecretEnc,
          totpPendingSecretEnc: null,
          totpEnabled: true,
          totpEnabledAt: new Date(),
          mfaEnabled: true,
          backupCodeHashes,
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

  // Case 2: Login challenge — verify and set mfaVerifiedAt on session
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
      return ApiErrors.VALIDATION_ERROR("Invalid or expired code.");
    }
    // Mark ALL sessions for this user as 2FA-verified so the session callback sees it regardless of which row it reads
    await prisma.session.updateMany({
      where: { userId: session.user.id },
      data: { mfaVerifiedAt: new Date() },
    });
    // Cookie fallback: store current user id so layout can allow this user but reject stale cookie from another user.
    const MFA_COOKIE_MAX_AGE_SECONDS = 8 * 60 * 60;
    const res = apiSuccess({ verified: true });
    res.cookies.set("mfa_just_verified", session.user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: MFA_COOKIE_MAX_AGE_SECONDS,
      path: "/",
    });
    return res;
  }

  return ApiErrors.VALIDATION_ERROR("No pending 2FA setup or challenge.");
});
