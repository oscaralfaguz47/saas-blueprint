import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { getOptionalEnv } from "@/lib/env";
import { writeAuditLog } from "@/server/services/audit";
import { generateTotpSecret, buildOtpauthUri } from "@/server/services/totp";
import { encryptTotpSecret } from "@/server/services/account-encryption";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 3;
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
 * POST /api/account/2fa/setup
 * Start 2FA setup: generate secret, store encrypted in totpPendingSecretEnc, return otpauth URI and manual key.
 */
export const POST = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, isPlatformBlocked: true, email: true, name: true },
  });
  if (!user) return ApiErrors.NOT_FOUND("User");
  if (user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  if (!checkRateLimit(session.user.id)) {
    return ApiErrors.RATE_LIMITED("Too many 2FA setup attempts. Try again in a minute.");
  }

  const { raw, base32 } = generateTotpSecret();
  const encrypted = encryptTotpSecret(raw);

  await prisma.userSecurity.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      totpPendingSecretEnc: encrypted,
    },
    update: { totpPendingSecretEnc: encrypted },
  });

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId: null,
    action: "account.2fa.setup_started",
    targetType: "User",
    targetId: session.user.id,
    targetUserId: session.user.id,
  });

  const accountName = user.email ?? user.name ?? user.id;
  const totpIssuer = getOptionalEnv("APP_NAME")?.trim() || "Account";
  const otpauthUri = buildOtpauthUri({
    secretBase32: base32,
    accountName,
    issuer: totpIssuer,
  });

  return apiSuccess({
    otpauthUri,
    manualKey: base32,
  });
});
