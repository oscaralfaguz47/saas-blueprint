import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireFullSession } from "@/server/require-full-session";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { verifyTotpCode, hashBackupCode } from "@/server/services/totp";
import { decryptTotpSecret } from "@/server/services/account-encryption";
import { verifyEmailOtp } from "@/server/services/email-otp";
import { z } from "zod";

const bodySchema = z.object({
  code: z.string().min(1).max(32).trim(),
});

/**
 * POST /api/auth/step-up/verify
 * Verify TOTP, backup code (if 2FA enabled), or email OTP (if 2FA not enabled).
 * On success, updates session.mfaVerifiedAt to now for step-up eligibility (per isStepUpEligible).
 */
export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const body = await req.json().catch(() => null);
  const parse = bodySchema.safeParse(body);
  if (!parse.success) {
    return ApiErrors.VALIDATION_ERROR("Please enter a valid code.");
  }

  const { code } = parse.data;
  const userId = session.user.id;

  const security = await prisma.userSecurity.findUnique({
    where: { userId },
    select: { totpEnabled: true, totpSecretEnc: true, backupCodeHashes: true },
  });

  let valid = false;

  if (security?.totpEnabled && security.totpSecretEnc) {
    const isSixDigits = /^[0-9]{6}$/.test(code);
    if (isSixDigits) {
      const secretRaw = decryptTotpSecret(security.totpSecretEnc);
      valid = verifyTotpCode(secretRaw, code);
    }
    if (!valid && (security.backupCodeHashes?.length ?? 0) > 0) {
      const hash = hashBackupCode(code, userId);
      const hashes = security.backupCodeHashes ?? [];
      const idx = hashes.indexOf(hash);
      if (idx !== -1) {
        valid = true;
        const updatedHashes = hashes.filter((_, i) => i !== idx);
        await prisma.userSecurity.update({
          where: { userId },
          data: { backupCodeHashes: updatedHashes },
        });
      }
    }
  } else if (!security?.totpEnabled) {
    const email = session.user.email ?? "";
    if (!email.trim()) {
      return ApiErrors.VALIDATION_ERROR("No email on file for verification.");
    }
    const result = await verifyEmailOtp(email, code);
    valid = result.success;
  } else {
    return ApiErrors.VALIDATION_ERROR("Two-factor authentication is not fully configured.");
  }

  if (!valid) {
    return ApiErrors.VALIDATION_ERROR("Invalid code. Please try again.");
  }

  // Update mfaVerifiedAt on the user's current session
  const sessionToken = session.user.sessionToken;

  let updatedCount = 0;

  if (sessionToken) {
    // Primary: update by exact session token
    const updated = await prisma.session.updateMany({
      where: {
        sessionToken,
        revokedAt: null,
      },
      data: { mfaVerifiedAt: new Date() },
    });
    updatedCount = updated.count;
  }

  if (updatedCount === 0) {
    // Fallback: update most recent non-revoked session for this user
    // (handles case where sessionToken is missing from JWT)
    const now = new Date();
    const updated = await prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        expires: { gt: now },
      },
      data: { mfaVerifiedAt: now },
    });
    updatedCount = updated.count;
  }

  // Also store in UserSecurity as fallback when Session row is unavailable
  await prisma.userSecurity.upsert({
    where: { userId },
    create: {
      userId,
      stepUpVerifiedAt: new Date(),
    },
    update: {
      stepUpVerifiedAt: new Date(),
    },
  });

  // Always return success if code was valid — even if no session
  // row was found (edge case: session will be re-checked on next request)
  return apiSuccess({ verified: true });
});
