import "server-only";
import { z } from "zod";
import { ApiErrors, apiError, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { prisma } from "@/server/db";
import { verifyEmailOtp } from "@/server/services/email-otp";
import { createPasskeyOneTimeToken } from "@/server/auth-options";

const bodySchema = z.object({
  email: z.string().email().max(191).transform((v) => v.trim().toLowerCase()),
  code: z.string().length(6).regex(/^\d{6}$/),
});

export const POST = withErrorHandler(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const parse = bodySchema.safeParse(body);
  if (!parse.success) {
    return ApiErrors.VALIDATION_ERROR("Please enter a valid 6-digit code.");
  }

  const { email, code } = parse.data;
  const otpResult = await verifyEmailOtp(email, code);

  if (!otpResult.success) {
    if (otpResult.error === "too_many_attempts") {
      return apiError(
        "RATE_LIMITED",
        429,
        "Too many incorrect attempts. Please request a new code.",
        { code: "TOO_MANY_ATTEMPTS" }
      );
    }
    if (otpResult.error === "expired") {
      return apiError(
        "VALIDATION_ERROR",
        400,
        "This code has expired. Please request a new one.",
        { code: "CODE_EXPIRED" }
      );
    }
    return apiError(
      "VALIDATION_ERROR",
      400,
      "Invalid code. Please check and try again.",
      { code: "INVALID_CODE" }
    );
  }

  let user = await prisma.user.findUnique({
    where: { email: otpResult.email },
    select: { id: true, isPlatformBlocked: true, role: true, name: true, image: true, email: true },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: otpResult.email,
        appearance: "DARK",
      },
      select: { id: true, isPlatformBlocked: true, role: true, name: true, image: true, email: true },
    });
  }

  if (user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  // One-time token for the credentials provider handoff.
  const sessionToken = await createPasskeyOneTimeToken(user.id);
  return apiSuccess({ sessionToken, email: otpResult.email });
});

