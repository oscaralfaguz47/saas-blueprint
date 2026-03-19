import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/server/db";
import { generateEmailOtp } from "@/server/services/email-otp";
import { sendMagicLink } from "@/server/services/send-magic-link";
import { ApiErrors, apiError, apiSuccess, withErrorHandler } from "@/lib/api-response";

const bodySchema = z.object({
  email: z.string().email().max(191).transform((v) => v.trim().toLowerCase()),
  callbackUrl: z.string().optional(),
});

function getSafeCallbackUrl(value: string | null | undefined) {
  if (!value) return "/app/requests";
  return value.startsWith("/") ? value : "/app/requests";
}

function hashVerificationToken(token: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET not set");
  return createHash("sha256").update(`${token}${secret}`).digest("hex");
}

export const POST = withErrorHandler(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const parse = bodySchema.safeParse(body);
  if (!parse.success) {
    return ApiErrors.VALIDATION_ERROR("Please enter a valid email address.");
  }

  const email = parse.data.email;
  const callbackUrl = getSafeCallbackUrl(parse.data.callbackUrl ?? null);

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

  console.log("[DEBUG email-otp send]", { email, otpCode: otpResult.code, sent: true });

  const magicFrom = process.env.EMAIL_FROM;
  if (!magicFrom) {
    return ApiErrors.INTERNAL_ERROR("Email not configured");
  }

  const baseUrl = process.env.NEXTAUTH_URL;
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
    appName: process.env.APP_NAME ?? undefined,
  });

  return apiSuccess({ sent: true, email });
});

