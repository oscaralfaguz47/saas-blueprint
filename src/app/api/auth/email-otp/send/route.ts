import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/server/db";
import { generateEmailOtp } from "@/server/services/email-otp";
import { sendMagicLink } from "@/server/services/send-magic-link";
import { writeAuditLog } from "@/server/services/audit";
import { ApiErrors, apiError, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody } from "@/lib/validations";
import { ValidationError } from "@/lib/validations/common";
import { env } from "@/lib/env";

const bodySchema = z.object({
  email: z.string().email().max(191).transform((v) => v.trim().toLowerCase()),
  callbackUrl: z.string().optional(),
});

function getSafeCallbackUrl(value: string | null | undefined) {
  if (!value) return "/app/requests";
  return value.startsWith("/") ? value : "/app/requests";
}

function hashVerificationToken(token: string): string {
  const secret = env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET not set");
  return createHash("sha256").update(`${token}${secret}`).digest("hex");
}

export const POST = withErrorHandler(async (req: Request) => {
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = await parseBody(req, bodySchema);
  } catch (e) {
    if (e instanceof ValidationError) {
      return ApiErrors.VALIDATION_ERROR("Please enter a valid email address.");
    }
    throw e;
  }

  const email = parsed.email;
  const callbackUrl = getSafeCallbackUrl(parsed.callbackUrl ?? null);

  const otpResult = await generateEmailOtp(email);
  if (!otpResult.success) {
    const retryAfterSec = Math.ceil(otpResult.retryAfterMs / 1000);
    return apiError(
      "RATE_LIMITED",
      429,
      `Please wait ${retryAfterSec} seconds before requesting another code.`,
      { retryAfterSec }
    );
  }

  const magicFrom = env.EMAIL_FROM;
  if (!magicFrom) {
    return ApiErrors.INTERNAL_ERROR("Email not configured");
  }

  const baseUrl = env.NEXTAUTH_URL;
  if (!baseUrl) {
    return ApiErrors.INTERNAL_ERROR("Server misconfiguration");
  }

  // Create a NextAuth-compatible verification token (magic-link fallback).
  const rawMagicToken = randomBytes(32).toString("hex");
  const magicTokenHash = hashVerificationToken(rawMagicToken);
  const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token: magicTokenHash,
      expires,
    },
  });

  const magicLinkUrl = `${baseUrl}/api/auth/callback/email?callbackUrl=${encodeURIComponent(
    callbackUrl
  )}&token=${encodeURIComponent(rawMagicToken)}&email=${encodeURIComponent(email)}`;

  await sendMagicLink({
    email,
    url: magicLinkUrl,
    from: magicFrom,
    otpCode: otpResult.code,
    appName: env.APP_NAME ?? undefined,
  });

  // Look up user for audit log (best effort)
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    writeAuditLog({
      actorUserId: existingUser.id,
      actorContext: "TENANT",
      tenantId: null,
      action: "auth.otp.sent",
      targetType: "User",
      targetId: existingUser.id,
      targetUserId: existingUser.id,
      metadata: { email },
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    }).catch(() => {});
  }

  return apiSuccess({ sent: true, email });
});
