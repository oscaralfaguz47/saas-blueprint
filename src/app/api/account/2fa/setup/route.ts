import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { getOptionalEnv } from "@/lib/env";
import { requireFullSessionOrForcedMfaSetup } from "@/server/require-full-session";
import { writeAuditLog } from "@/server/services/audit";
import { generateTotpSecret, buildOtpauthUri } from "@/server/services/totp";
import { encryptTotpSecret } from "@/server/services/account-encryption";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/account/2fa/setup
 * Start 2FA setup: generate secret, store encrypted in totpPendingSecretEnc, return otpauth URI and manual key.
 */
export const POST = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSessionOrForcedMfaSetup(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, isPlatformBlocked: true, email: true, name: true },
  });
  if (!user) return ApiErrors.NOT_FOUND("User");
  if (user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  const rateLimitResult = await checkRateLimit(
    `account:2fa:setup:${session.user.id}`,
    3,
    60 * 1000
  );
  if (!rateLimitResult.allowed) {
    return ApiErrors.RATE_LIMITED("Too many 2FA setup attempts. Try again in a minute.", {
      retryAfterSeconds: rateLimitResult.retryAfterSeconds,
    });
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
