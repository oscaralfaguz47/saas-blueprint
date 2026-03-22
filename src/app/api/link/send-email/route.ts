import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { env } from "@/lib/env";
import { prisma } from "@/server/db";
import { sendMagicLink } from "@/server/services/send-magic-link";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";

const BodySchema = z.object({ token: z.string().min(1) });

const MIN_SEND_INTERVAL_MS = 60 * 1000;
const MAX_SENDS = 3;

function hashVerificationToken(token: string): string {
  const secret = env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET not set");
  return createHash("sha256").update(`${token}${secret}`).digest("hex");
}

export const POST = withErrorHandler(async (req: Request) => {
  const body = await req.json();
  const parse = BodySchema.safeParse(body);
  if (!parse.success) {
    return ApiErrors.VALIDATION_ERROR("Missing or invalid token");
  }
  const rawToken = parse.data.token.trim();

  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const challenge = await prisma.authLinkChallenge.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      email: true,
      expiresAt: true,
      consumedAt: true,
      lastSentAt: true,
      sendCount: true,
    },
  });

  const now = new Date();
  if (!challenge || challenge.consumedAt || challenge.expiresAt <= now) {
    return ApiErrors.VALIDATION_ERROR("Invalid or expired challenge");
  }

  if (challenge.sendCount >= MAX_SENDS) {
    return ApiErrors.RATE_LIMITED(
      "Maximum sends reached. Please try signing in again."
    );
  }
  if (challenge.lastSentAt && now.getTime() - challenge.lastSentAt.getTime() < MIN_SEND_INTERVAL_MS) {
    return ApiErrors.RATE_LIMITED("Please wait before requesting another email.");
  }

  const from = env.EMAIL_FROM;
  if (!from) {
    console.error("[link/send-email] EMAIL_FROM env var not set");
    return ApiErrors.INTERNAL_ERROR();
  }

  const baseUrl = env.NEXTAUTH_URL;
  if (!baseUrl) {
    console.error("[link/send-email] NEXTAUTH_URL env var not set");
    return ApiErrors.INTERNAL_ERROR();
  }

  const magicToken = randomBytes(32).toString("hex");
  const magicTokenHash = hashVerificationToken(magicToken);
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.verificationToken.create({
      data: {
        identifier: challenge.email,
        token: magicTokenHash,
        expires,
      },
    }),
    prisma.authLinkChallenge.update({
      where: { id: challenge.id },
      data: { lastSentAt: now, sendCount: challenge.sendCount + 1 },
    }),
  ]);

  const callbackUrl = "/app/requests";
  const magicLinkUrl = `${baseUrl}/api/auth/callback/email?callbackUrl=${encodeURIComponent(callbackUrl)}&token=${encodeURIComponent(magicToken)}&email=${encodeURIComponent(challenge.email)}`;

  await sendMagicLink({
    email: challenge.email,
    url: magicLinkUrl,
    from,
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: challenge.userId,
      actorContext: "TENANT",
      tenantId: null,
      action: "auth.link.challenge.sent",
      targetType: "AuthLinkChallenge",
      targetId: challenge.id,
      metadata: { email: challenge.email },
    },
  });

  return apiSuccess({ ok: true });
});
