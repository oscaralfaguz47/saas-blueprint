import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/services/audit";
import {
  verifyTotpCode,
  hashBackupCode,
} from "@/server/services/totp";
import { decryptTotpSecret } from "@/server/services/account-encryption";
import {
  rotateSessionAfterMfa,
} from "@/server/services/session-rotate";
import {
  generateRememberDeviceToken,
  getRememberDeviceExpiry,
  getRememberDeviceCookieName,
  rememberDeviceCookieOptions,
  isValidRememberDays,
} from "@/server/services/remember-device";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, auth2FaVerifySchema } from "@/lib/validations";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 10;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function getClientKey(req: Request, userId?: string): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
  return userId ? `${userId}:${ip}` : ip;
}

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (now >= entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}



/**
 * POST /api/auth/2fa/verify
 * Login MFA: verify TOTP or backup code for PENDING_MFA session, then rotate to FULL session,
 * optionally create remembered device and set cookie.
 */
export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const sessionToken = session.user.sessionToken;
  if (!sessionToken) return ApiErrors.UNAUTHENTICATED();

  if (!checkRateLimit(getClientKey(req, session.user.id))) {
    return ApiErrors.RATE_LIMITED("Too many attempts. Try again in a minute.");
  }

  const sessionRow = await prisma.session.findUnique({
    where: { sessionToken },
    select: { authLevel: true, revokedAt: true, mfaChallengeExpiresAt: true, expires: true },
  });

  if (!sessionRow || sessionRow.revokedAt) {
    return ApiErrors.MFA_CHALLENGE_EXPIRED();
  }
  if (sessionRow.authLevel !== "PENDING_MFA") {
    return ApiErrors.VALIDATION_ERROR("Session is not pending MFA verification.");
  }
  const now = new Date();
  if (
    (sessionRow.mfaChallengeExpiresAt && now > sessionRow.mfaChallengeExpiresAt) ||
    now > sessionRow.expires
  ) {
    return ApiErrors.MFA_CHALLENGE_EXPIRED();
  }

  const body = await parseBody(req, auth2FaVerifySchema);
  const code = body.code.trim();
  const isSixDigits = /^[0-9]{6}$/.test(code);

  const security = await prisma.userSecurity.findUnique({
    where: { userId: session.user.id },
    select: { totpSecretEnc: true, backupCodeHashes: true },
  });
  if (!security?.totpSecretEnc) return ApiErrors.NOT_FOUND("User security");

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
  if (!valid) return ApiErrors.INVALID_2FA_CODE();

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;

  const { newSessionToken } = await rotateSessionAfterMfa({
    userId: session.user.id,
    oldSessionToken: sessionToken,
    ip,
    userAgent,
  });

  const res = apiSuccess({ verified: true });

  if (body.rememberDevice && body.rememberDays && isValidRememberDays(Number(body.rememberDays))) {
    const days = Number(body.rememberDays) as 30 | 60 | 90;
    const { raw, hash } = generateRememberDeviceToken();
    const expiresAt = getRememberDeviceExpiry(days);

    await prisma.rememberedDevice.create({
      data: {
        userId: session.user.id,
        tokenHash: hash,
        userAgent: userAgent ?? undefined,
        ipFirstSeen: ip ?? undefined,
        expiresAt,
      },
    });

    const maxAgeSeconds = days * 24 * 60 * 60;
    const rmdName = getRememberDeviceCookieName();
    res.cookies.set(rmdName, raw, {
      ...rememberDeviceCookieOptions(maxAgeSeconds),
      ...(process.env.NODE_ENV !== "production" ? { secure: false } : {}),
    });

    await writeAuditLog({
      actorUserId: session.user.id,
      actorContext: "TENANT",
      tenantId: null,
      action: "account.remember_device.enabled",
      targetType: "User",
      targetId: session.user.id,
      targetUserId: session.user.id,
      metadata: { days },
    });
  }

  return res;
});
