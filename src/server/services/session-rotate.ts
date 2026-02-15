import "server-only";

import { randomBytes } from "node:crypto";
import { encode } from "next-auth/jwt";
import { prisma } from "@/server/db";
import { getRequiredEnv } from "@/lib/env";

const JWT_MAX_AGE_SECONDS = 8 * 60 * 60;

/**
 * After successful MFA verify: revoke the pending session, create a new FULL session,
 * and produce a new JWT string to set as the session cookie (session rotation).
 */
export async function rotateSessionAfterMfa(params: {
  userId: string;
  oldSessionToken: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ newSessionToken: string; encodedJwt: string }> {
  const secret = getRequiredEnv("NEXTAUTH_SECRET");
  const now = new Date();

  await prisma.session.updateMany({
    where: { sessionToken: params.oldSessionToken },
    data: { revokedAt: now, logoutReason: "mfa_upgraded" },
  });

  const newSessionToken = randomBytes(32).toString("base64url");
  const expires = new Date(now.getTime() + JWT_MAX_AGE_SECONDS * 1000);

  await prisma.session.create({
    data: {
      sessionToken: newSessionToken,
      userId: params.userId,
      expires,
      authLevel: "FULL",
      mfaVerifiedAt: now,
      lastActivityAt: now,
      ipFirstSeen: params.ip ?? null,
      lastIp: params.ip ?? null,
      userAgent: params.userAgent ?? null,
    },
  });

  const payload = {
    sub: params.userId,
    sessionToken: newSessionToken,
    iat: Math.floor(now.getTime() / 1000),
  };

  const encodedJwt = await encode({
    token: payload,
    secret,
    maxAge: JWT_MAX_AGE_SECONDS,
  });

  return { newSessionToken, encodedJwt };
}
