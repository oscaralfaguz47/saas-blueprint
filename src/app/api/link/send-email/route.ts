import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/server/db";
import { sendMagicLink } from "@/server/services/send-magic-link";

const BodySchema = z.object({ token: z.string().min(1) });

const MIN_SEND_INTERVAL_MS = 60 * 1000;
const MAX_SENDS = 3;

function hashVerificationToken(token: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET not set");
  return createHash("sha256").update(`${token}${secret}`).digest("hex");
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parse = BodySchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: "Missing or invalid token" }, { status: 400 });
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
    return NextResponse.json({ error: "Invalid or expired challenge" }, { status: 400 });
  }

  if (challenge.sendCount >= MAX_SENDS) {
    return NextResponse.json({ error: "Maximum sends reached. Please try signing in with Microsoft again." }, { status: 429 });
  }
  if (challenge.lastSentAt && now.getTime() - challenge.lastSentAt.getTime() < MIN_SEND_INTERVAL_MS) {
    return NextResponse.json({ error: "Please wait before requesting another email." }, { status: 429 });
  }

  const from = process.env.EMAIL_FROM;
  if (!from) {
    return NextResponse.json({ error: "Email not configured" }, { status: 500 });
  }

  const baseUrl = process.env.NEXTAUTH_URL;
  if (!baseUrl) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
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

  return NextResponse.json({ ok: true });
}
