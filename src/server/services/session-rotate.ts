import "server-only";

import { randomBytes } from "node:crypto";
import { encode } from "next-auth/jwt";
import { prisma } from "@/server/db";
import { getRequiredEnv } from "@/lib/env";

const JWT_MAX_AGE_SECONDS = 8 * 60 * 60;

/**
 * After successful MFA verify: elevate the pending session to FULL session
 */
export async function rotateSessionAfterMfa(params: {
  userId: string;
  oldSessionToken: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ newSessionToken: string }> {
  const now = new Date();

  // Elevate the existing session token
  await prisma.session.updateMany({
    where: { sessionToken: params.oldSessionToken },
    data: {
      authLevel: "FULL",
      mfaVerifiedAt: now,
      lastActivityAt: now,
      lastIp: params.ip ?? null,
      userAgent: params.userAgent ?? null,
    },
  });

  return { newSessionToken: params.oldSessionToken };
}
