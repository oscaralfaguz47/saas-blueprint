import "server-only";
import { z } from "zod";
import { ApiErrors, apiError, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { prisma } from "@/server/db";
import { verifyEmailOtp } from "@/server/services/email-otp";
import { createPasskeyOneTimeToken } from "@/server/auth-options";
import { writeAuditLog } from "@/server/services/audit";

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
  const result = await verifyEmailOtp(email, code);

  if (!result.success) {
    // Try to find userId for audit log (best effort)
    const failedUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (failedUser) {
      writeAuditLog({
        actorUserId: failedUser.id,
        actorContext: "TENANT",
        tenantId: null,
        action: "auth.otp.failed",
        targetType: "User",
        targetId: failedUser.id,
        targetUserId: failedUser.id,
        metadata: {
          reason: result.error,
          email,
        },
        ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: req.headers.get("user-agent") ?? null,
      }).catch(() => {});
    }

    if (result.error === "too_many_attempts") {
      return apiError(
        "RATE_LIMITED",
        429,
        "Too many incorrect attempts. Please request a new code.",
        { code: "TOO_MANY_ATTEMPTS" }
      );
    }
    if (result.error === "expired") {
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
    where: { email: result.email },
    select: { id: true, isPlatformBlocked: true, role: true, name: true, image: true, email: true },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: result.email,
        appearance: "DARK",
      },
      select: { id: true, isPlatformBlocked: true, role: true, name: true, image: true, email: true },
    });
  }

  if (user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  // Security: invalidate any pending NextAuth magic links for this email
  // so the magic link cannot be used after a successful OTP sign-in
  await prisma.verificationToken.deleteMany({
    where: { identifier: email },
  });

  // One-time token for the credentials provider handoff.
  const sessionToken = await createPasskeyOneTimeToken(user.id);

  // Audit log — non-blocking
  writeAuditLog({
    actorUserId: user.id,
    actorContext: "TENANT",
    tenantId: null,
    action: "auth.otp.verified",
    targetType: "User",
    targetId: user.id,
    targetUserId: user.id,
    metadata: { email: result.email },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  }).catch(() => {});

  return apiSuccess({ sessionToken, email: result.email });
});

