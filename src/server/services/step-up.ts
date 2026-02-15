import "server-only";

import { prisma } from "@/server/db";

const STEP_UP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Step-up eligibility: session must be FULL with mfaVerifiedAt within the last 10 minutes.
 * Used for: disable 2FA, regenerate backup codes, change auto-logout, issue remembered device.
 */
export async function isStepUpEligible(
  sessionToken: string,
  userId: string
): Promise<boolean> {
  const session = await prisma.session.findUnique({
    where: { sessionToken },
    select: { authLevel: true, mfaVerifiedAt: true, revokedAt: true },
  });

  if (!session || session.revokedAt) return false;
  if (session.authLevel !== "FULL") return false;
  if (!session.mfaVerifiedAt) return false;

  const elapsed = Date.now() - session.mfaVerifiedAt.getTime();
  return elapsed <= STEP_UP_WINDOW_MS;
}
