import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { getOptionalEnv } from "@/lib/env";
import { buildOtpauthUri, rawSecretToBase32 } from "@/server/services/totp";
import { decryptTotpSecret } from "@/server/services/account-encryption";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";

/**
 * GET /api/account/2fa/setup-status
 * When user has a pending 2FA setup (totpPendingSecretEnc), return otpauthUri and manualKey
 * so the client can show the QR again after navigation.
 */
export const GET = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, isPlatformBlocked: true, email: true, name: true },
  });
  if (!user) return ApiErrors.NOT_FOUND("User");
  if (user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  const security = await prisma.userSecurity.findUnique({
    where: { userId: session.user.id },
    select: { totpPendingSecretEnc: true },
  });

  if (!security?.totpPendingSecretEnc) {
    return apiSuccess({ pending: false });
  }

  const raw = decryptTotpSecret(security.totpPendingSecretEnc);
  const base32 = rawSecretToBase32(raw);
  const accountName = user.email ?? user.name ?? user.id;
  const totpIssuer = getOptionalEnv("APP_NAME")?.trim() || "Account";
  const otpauthUri = buildOtpauthUri({
    secretBase32: base32,
    accountName,
    issuer: totpIssuer,
  });

  return apiSuccess({
    pending: true,
    otpauthUri,
    manualKey: base32,
  });
});
