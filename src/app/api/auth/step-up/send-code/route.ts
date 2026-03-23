import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireFullSession } from "@/server/require-full-session";
import { ApiErrors, apiError, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { generateEmailOtp } from "@/server/services/email-otp";
import { sendMagicLink } from "@/server/services/send-magic-link";
import { env } from "@/lib/env";

/**
 * POST /api/auth/step-up/send-code
 * Send an email OTP for step-up verification (users without TOTP 2FA).
 */
export const POST = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user?.email) return ApiErrors.UNAUTHENTICATED();

  const result = await generateEmailOtp(session.user.email);

  if (!result.success) {
    const retryAfterSec = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
    return apiError(
      "RATE_LIMITED",
      429,
      `Please wait ${retryAfterSec} seconds before requesting another code.`,
      { retryAfterSec },
    );
  }

  const from = env.EMAIL_FROM ?? "";
  if (!from) {
    return ApiErrors.INTERNAL_ERROR("Email is not configured. Contact support.");
  }

  await sendMagicLink({
    email: session.user.email,
    url: `${env.NEXTAUTH_URL ?? ""}/app`,
    from,
    otpCode: result.code,
    appName: env.APP_NAME ?? undefined,
    showMagicLink: false,
  });

  return apiSuccess({ sent: true });
});
